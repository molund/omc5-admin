// The rich text toolbar's place on the phone: on top of the keyboard, at the bottom of the window. The boxes are inside the
// page's scrolling view, so the bar is handed up to a slot the Frame keeps outside it (KeyboardBarHost). KeyboardBar.web.js
// is the web's. iOS scrolls the box with the focus clear of the keyboard but not of the bar, so the host scrolls it the rest
// of the way.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Keyboard, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Slot = createContext(null);

const GAP = 8; // between the box and the bar, or the top of the window
const SETTLE = 250; // ms for iOS's own scroll to the box to finish

/**
 * Around the whole window, in the Frame: shows the bar a KeyboardBar hands it while the keyboard is up.
 * @param {object} props
 * @param {{ current: object }} props.scroll The page's ScrollView.
 * @param {{ current: number }} props.offset How far it's scrolled.
 */
export function KeyboardBarHost({ children, scroll, offset }) {
  const [bar, setBar] = useState(null);
  const [keyboard, setKeyboard] = useState(0);
  const insets = useSafeAreaInsets();
  const barHeight = useRef(56);
  const now = useRef({});
  now.current = { keyboard, insets, showing: !!bar };
  // scrolls the box with the focus up out from under the bar, keeping a box too tall for the room left by its top
  const reveal = () => {
    const { keyboard, insets, showing } = now.current;
    if (!showing || !keyboard) return;
    TextInput.State.currentlyFocusedInput()?.measureInWindow((x, y, w, h) => {
      const barTop = Dimensions.get("window").height - keyboard - barHeight.current - GAP;
      const by = Math.min(y + h - barTop, y - insets.top - GAP);
      if (by > 0) scroll?.current?.scrollTo({ y: offset.current + by, animated: true });
    });
  };
  const later = useRef(null);
  const revealSoon = () => {
    clearTimeout(later.current);
    later.current = setTimeout(reveal, SETTLE);
  };
  useEffect(() => {
    if (keyboard > 0 && bar) revealSoon();
  }, [keyboard, !!bar]);
  useEffect(() => () => clearTimeout(later.current), []);
  useEffect(() => {
    const move = (e) => {
      // no LayoutAnimation here: when the Add Link sheet closes, React's own code for it throws and the app closes
      setKeyboard(e?.endCoordinates?.height ?? 0);
    };
    const subs = [
      Keyboard.addListener("keyboardWillChangeFrame", move),
      Keyboard.addListener("keyboardWillHide", () => setKeyboard(0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  const slot = useMemo(() => ({ setBar, reveal: revealSoon }), []);
  return (
    <Slot.Provider value={slot}>
      <View style={{ flex: 1 }}>{children}</View>
      {bar && keyboard > 0 && (
        <View
          pointerEvents="box-none"
          onLayout={(e) => (barHeight.current = e.nativeEvent.layout.height)}
          style={{ position: "absolute", left: 0, right: 0, bottom: keyboard }}
        >
          {bar}
        </View>
      )}
    </Slot.Provider>
  );
}

/** @param {object} props @param {string} [props.focusKey] The box with the focus: a new one is scrolled clear of the bar. */
export function KeyboardBar({ visible, children, focusKey }) {
  const slot = useContext(Slot);
  useEffect(() => {
    slot?.setBar(visible ? children : null);
  });
  useEffect(() => {
    if (focusKey) slot?.reveal();
  }, [focusKey]);
  useEffect(() => () => slot?.setBar(null), [slot]);
  return null;
}
