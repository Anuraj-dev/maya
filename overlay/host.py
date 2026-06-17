#!/usr/bin/env python3
"""Maya overlay host.

Renders overlay/index.html inside a transparent, always-on-top WebKit2GTK surface
anchored to the top-right via wlr-layer-shell. Connects to the Maya bridge WebSocket
(ws://localhost:4517) and pushes each snapshot into the page via window.mayaUpdate().
Messages posted from the page (approve / deny / abort) are forwarded back over the
WebSocket so the daemon can react.

Stack (all on Fedora + Hyprland, layer-shell needs: sudo dnf install gtk-layer-shell):
  GTK 3 · GtkLayerShell 0.1 · WebKit2 4.1 · PyGObject · websocket-client

Run:  python3 overlay/host.py
"""

import json
import os
import subprocess
import sys
import threading
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("WebKit2", "4.1")

HAS_LAYER_SHELL = False
try:
    gi.require_version("GtkLayerShell", "0.1")
    from gi.repository import GtkLayerShell  # noqa: E402
    HAS_LAYER_SHELL = True
except ValueError:
    print(
        "[maya-overlay] gtk-layer-shell not installed → floating window mode.\n"
        "               For proper Wayland overlay: sudo dnf install gtk-layer-shell",
        file=sys.stderr,
    )

from gi.repository import Gdk, GLib, Gtk, WebKit2  # noqa: E402

try:
    import cairo
except Exception:
    cairo = None

try:
    import websocket
except ImportError:
    print(
        "[maya-overlay] websocket-client missing. Run: pip3 install --user websocket-client",
        file=sys.stderr,
    )
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(HERE, "index.html")
BRIDGE_URL = "ws://localhost:4517"
RECONNECT_DELAY_S = 2.0
TOP_MARGIN = 14
RIGHT_MARGIN = 14
WIN_W = 366
WIN_H = 440


class Overlay:
    def __init__(self):
        self.ready = False
        self.ws = None
        self.ws_running = True
        self._current_state = "idle"

        # JS ↔ Python bridge via WebKit UserContentManager
        self.manager = WebKit2.UserContentManager()
        self.manager.register_script_message_handler("maya")
        self.manager.connect("script-message-received::maya", self._on_js_message)

        self.win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
        self.win.set_decorated(False)
        self.win.set_resizable(False)
        self.win.set_app_paintable(True)
        self.win.set_default_size(WIN_W, WIN_H)

        screen = self.win.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None:
            self.win.set_visual(visual)

        if HAS_LAYER_SHELL:
            self._init_layer_shell()
        else:
            self._init_fallback_position()

        self.web = WebKit2.WebView.new_with_user_content_manager(self.manager)
        self.web.set_background_color(Gdk.RGBA(0, 0, 0, 0))
        settings = self.web.get_settings()
        settings.set_property("enable-write-console-messages-to-stdout", True)
        self.web.load_uri("file://" + HTML_PATH)
        self.web.connect("load-changed", self._on_load)
        self.win.add(self.web)

        self.win.connect("realize", self._on_realize)
        self.win.connect("destroy", self._on_destroy)

        threading.Thread(target=self._ws_loop, daemon=True).start()

    # ── layer-shell / fallback positioning ──────────────────
    def _init_layer_shell(self):
        try:
            GtkLayerShell.init_for_window(self.win)
            GtkLayerShell.set_namespace(self.win, "maya-overlay")
            GtkLayerShell.set_layer(self.win, GtkLayerShell.Layer.OVERLAY)
            GtkLayerShell.set_anchor(self.win, GtkLayerShell.Edge.TOP, True)
            GtkLayerShell.set_anchor(self.win, GtkLayerShell.Edge.RIGHT, True)
            GtkLayerShell.set_margin(self.win, GtkLayerShell.Edge.TOP, TOP_MARGIN)
            GtkLayerShell.set_margin(self.win, GtkLayerShell.Edge.RIGHT, RIGHT_MARGIN)
            GtkLayerShell.set_keyboard_mode(self.win, GtkLayerShell.KeyboardMode.NONE)
        except Exception as e:
            print(f"[maya-overlay] layer-shell error: {e}", file=sys.stderr)

    def _init_fallback_position(self):
        # Hyprland window rules will float + pin this; we just set the title/class so it can be targeted.
        self.win.set_title("maya-overlay")
        self.win.set_wmclass("maya-overlay", "maya-overlay")
        # Attempt Hyprland rules at startup (best-effort; needs hyprctl on PATH)
        self._apply_hyprland_rules()

    def _apply_hyprland_rules(self):
        cls = "maya-overlay"
        rules = [
            f"float,class:^({cls})$",
            f"pin,class:^({cls})$",
            f"move 100%-{WIN_W + RIGHT_MARGIN} {TOP_MARGIN},class:^({cls})$",
            f"noborder,class:^({cls})$",
        ]
        for rule in rules:
            try:
                subprocess.run(
                    ["hyprctl", "keyword", "windowrulev2", rule],
                    capture_output=True, timeout=2,
                )
            except Exception:
                pass

    # ── GTK lifecycle ────────────────────────────────────────
    def _on_realize(self, _widget):
        self._set_click_through(True)

    def _on_load(self, _web, event):
        if event == WebKit2.LoadEvent.FINISHED:
            self.ready = True

    def _on_destroy(self, _widget):
        self.ws_running = False
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
        Gtk.main_quit()

    def _set_click_through(self, enabled: bool):
        """Empty input region → clicks pass through. Full region → clicks land."""
        if cairo is None:
            return
        gdkwin = self.win.get_window()
        if gdkwin is None:
            return
        try:
            if enabled:
                gdkwin.input_shape_combine_region(cairo.Region(), 0, 0)
            else:
                gdkwin.input_shape_combine_region(
                    cairo.Region(cairo.RectangleInt(0, 0, WIN_W, WIN_H)), 0, 0
                )
        except Exception:
            pass

    # ── JS ↔ Python bridge ───────────────────────────────────
    def _on_js_message(self, _manager, result):
        """Forward messages from the page (approve / deny / abort) over WebSocket."""
        try:
            val = result.get_js_value()
            msg = json.loads(val.to_string())
            self._ws_send(msg)
        except Exception as e:
            print(f"[maya-overlay] js-message error: {e}", file=sys.stderr)

    # ── WebSocket client ─────────────────────────────────────
    def _ws_loop(self):
        while self.ws_running:
            try:
                ws = websocket.WebSocketApp(
                    BRIDGE_URL,
                    on_open=self._on_ws_open,
                    on_message=self._on_ws_message,
                    on_close=self._on_ws_close,
                    on_error=lambda ws, e: None,
                )
                self.ws = ws
                ws.run_forever()
            except Exception as e:
                print(f"[maya-overlay] ws error: {e}", file=sys.stderr)
            if self.ws_running:
                GLib.idle_add(self._push_disconnected)
                time.sleep(RECONNECT_DELAY_S)

    def _on_ws_open(self, _ws):
        print("[maya-overlay] connected to bridge", file=sys.stderr)

    def _on_ws_close(self, _ws, code, _msg):
        self.ws = None

    def _on_ws_message(self, _ws, raw):
        try:
            msg = json.loads(raw)
            if msg.get("type") == "snapshot":
                GLib.idle_add(self._push, msg["snapshot"])
        except Exception:
            pass

    def _ws_send(self, msg: dict):
        if self.ws:
            try:
                self.ws.send(json.dumps(msg))
            except Exception:
                pass

    # ── push snapshot to WebView ─────────────────────────────
    def _push(self, snap: dict):
        if not self.ready:
            return False

        state = snap.get("state", "idle")
        self._current_state = state

        # Awaiting = buttons need to be clicked → disable click-through
        if state == "awaiting":
            self._set_click_through(False)
            if HAS_LAYER_SHELL:
                try:
                    GtkLayerShell.set_keyboard_mode(self.win, GtkLayerShell.KeyboardMode.ON_DEMAND)
                except Exception:
                    pass
        else:
            self._set_click_through(True)
            if HAS_LAYER_SHELL:
                try:
                    GtkLayerShell.set_keyboard_mode(self.win, GtkLayerShell.KeyboardMode.NONE)
                except Exception:
                    pass

        if not self.win.get_visible():
            self.win.show_all()
            self._set_click_through(state != "awaiting")

        js = "window.mayaUpdate && window.mayaUpdate(%s)" % json.dumps(snap)
        self._eval_js(js)
        return False

    def _push_disconnected(self):
        self._push({"state": "idle", "caption": "reconnecting…", "tasks": []})
        return False

    def _eval_js(self, js: str):
        if hasattr(self.web, "evaluate_javascript"):
            self.web.evaluate_javascript(js, -1, None, None, None, None, None)
        else:
            self.web.run_javascript(js, None, None, None)

    def run(self):
        self.win.show_all()
        self._set_click_through(True)
        Gtk.main()


def main():
    Overlay().run()


if __name__ == "__main__":
    main()
