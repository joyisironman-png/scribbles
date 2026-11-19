/*
  Gesture configuration for the Scribbles editor.
  Modelled on Instagram's story editor:
    • one finger drag        → move the item (centre guides snap, with a tiny buzz on Android)
    • two fingers            → pinch to resize, twist to rotate (the second finger can land anywhere)
    • a quick tap (< 0.2 s)  → on text: open the text editor. Never after a hold, a drag or a pinch.
    • press & hold           → the item lifts (shadow) into move mode; letting go just drops it.
    • drag onto the bin      → delete (the bin only appears while you're dragging)
    • mouse / trackpad       → corner handle to resize & turn, scroll to resize, Shift+scroll to turn,
                               Delete/Backspace removes the selected item
*/

export const GESTURES = {
  // A "tap" must be short and still. Anything longer or further is a drag.
  tapMaxMs: 200,
  tapMaxMovePx: 8,

  // Hold this long and the item "lifts" into move mode: releasing it will never open the editor.
  liftAfterMs: 200,

  // Once a second finger touches down, the whole gesture is a pinch: it can never become a tap.
  pinchLocksOutTap: true,

  // Size limits for anything you place (1 = original size).
  minScale: 0.25,
  maxScale: 7,

  // Magnetic centre lines (in picture units, the picture is 900 wide).
  snapDistance: 14,
  // Rotation clicks into straight (0°, 90°, 180°, 270°) when within this many degrees.
  rotationSnapDeg: 6,

  // The bin appears at the bottom-centre once you've dragged this far.
  trashShowAfterPx: 12,
  // How close (in picture units) the item's finger must be to the bin to delete on release.
  trashRadius: 95,
  trashY: 830,

  // Haptic tick length (Android; iPhone browsers ignore it).
  hapticMs: 8,

  // Text: tap an empty spot of the picture in Text mode to start typing there.
  tapCanvasToAddText: true,
};
