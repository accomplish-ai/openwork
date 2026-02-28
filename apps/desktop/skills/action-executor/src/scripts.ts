export const PYTHON_MOVE_MOUSE_SCRIPT = `
import Quartz
import math
import sys
import time

target_x = float(sys.argv[1])
target_y = float(sys.argv[2])

current_event = Quartz.CGEventCreate(None)
if current_event is None:
    start_x = target_x
    start_y = target_y
else:
    current_location = Quartz.CGEventGetLocation(current_event)
    start_x = float(current_location.x)
    start_y = float(current_location.y)

dx = target_x - start_x
dy = target_y - start_y
distance = math.hypot(dx, dy)

if distance <= 18.0:
    event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (target_x, target_y), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    sys.exit(0)

# Keep cursor motion visible, but prioritize responsiveness for UI automation.
duration_ms = max(35.0, min(180.0, distance * 0.22))
steps = int(max(3, min(20, round(distance / 38.0))))
sleep_seconds = (duration_ms / 1000.0) / steps

for step in range(1, steps + 1):
    linear_progress = step / steps
    eased_progress = 0.5 - (0.5 * math.cos(math.pi * linear_progress))
    next_x = start_x + (dx * eased_progress)
    next_y = start_y + (dy * eased_progress)
    event = Quartz.CGEventCreateMouseEvent(
        None, Quartz.kCGEventMouseMoved, (next_x, next_y), Quartz.kCGMouseButtonLeft
    )
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    if step < steps:
        time.sleep(sleep_seconds)
`.trim();

export const PYTHON_CLICK_SCRIPT = `
import Quartz
import sys
import time

x = float(sys.argv[1])
y = float(sys.argv[2])
button = sys.argv[3]

if button == "right":
    button_code = Quartz.kCGMouseButtonRight
    down_event = Quartz.kCGEventRightMouseDown
    up_event = Quartz.kCGEventRightMouseUp
else:
    button_code = Quartz.kCGMouseButtonLeft
    down_event = Quartz.kCGEventLeftMouseDown
    up_event = Quartz.kCGEventLeftMouseUp

pos = (x, y)
down = Quartz.CGEventCreateMouseEvent(None, down_event, pos, button_code)
up = Quartz.CGEventCreateMouseEvent(None, up_event, pos, button_code)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
time.sleep(0.05)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
`.trim();

export const PYTHON_DOUBLE_CLICK_SCRIPT = `
import Quartz
import sys
import time

x = float(sys.argv[1])
y = float(sys.argv[2])
pos = (x, y)

for i in range(2):
    down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pos, Quartz.kCGMouseButtonLeft)
    up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pos, Quartz.kCGMouseButtonLeft)
    Quartz.CGEventSetIntegerValueField(down, Quartz.kCGMouseEventClickState, i + 1)
    Quartz.CGEventSetIntegerValueField(up, Quartz.kCGMouseEventClickState, i + 1)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
    time.sleep(0.05)
`.trim();

export const PYTHON_SCROLL_SCRIPT = `
import Quartz
import sys

delta_y = int(sys.argv[1])
delta_x = int(sys.argv[2])
event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 2, delta_y, delta_x)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
`.trim();

export const APPLESCRIPT_TYPE_TEXT = [
  'on run argv',
  '  tell application "System Events" to keystroke (item 1 of argv)',
  'end run',
];

export const APPLESCRIPT_PRESS_KEY = [
  'on run argv',
  '  set keyValue to item 1 of argv',
  '  set useKeyCode to (item 2 of argv) is "true"',
  '  set modifiersCsv to item 3 of argv',
  '  set modifierList to {}',
  '  if modifiersCsv is not "" then',
  '    set AppleScript\'s text item delimiters to ","',
  '    set modifierTokens to text items of modifiersCsv',
  '    set AppleScript\'s text item delimiters to ""',
  '    repeat with token in modifierTokens',
  '      if token is "command" then',
  '        copy command down to end of modifierList',
  '      else if token is "shift" then',
  '        copy shift down to end of modifierList',
  '      else if token is "option" then',
  '        copy option down to end of modifierList',
  '      else if token is "control" then',
  '        copy control down to end of modifierList',
  '      end if',
  '    end repeat',
  '  end if',
  '  tell application "System Events"',
  '    if useKeyCode then',
  '      set keyCodeValue to keyValue as integer',
  '      if (count of modifierList) > 0 then',
  '        key code keyCodeValue using modifierList',
  '      else',
  '        key code keyCodeValue',
  '      end if',
  '    else',
  '      if (count of modifierList) > 0 then',
  '        keystroke keyValue using modifierList',
  '      else',
  '        keystroke keyValue',
  '      end if',
  '    end if',
  '  end tell',
  'end run',
];

export const APPLESCRIPT_ACTIVATE_APP = [
  'on run argv',
  '  set appName to item 1 of argv',
  '  tell application appName to activate',
  'end run',
];
