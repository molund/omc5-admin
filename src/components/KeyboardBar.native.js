// The rich text toolbar's place on the phone: on top of the keyboard, at the bottom of the window. The boxes are inside the
// page's scrolling view, so the bar is handed up to a slot the Frame keeps outside it (KeyboardBarHost). KeyboardBar.web.js
// is the web's.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Keyboard, LayoutAnimation, View } from "react-native";

const Slot = createContext(null);

/** Around the whole window, in the Frame: shows the bar a KeyboardBar hands it while the keyboard is up. */
export function KeyboardBarHost({ children }) {
  const [bar, setBar] = useState(null);
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const move = (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.create(e?.duration || 250, "keyboard", "opacity"));
      setKeyboard(e?.endCoordinates?.height ?? 0);
    };
    const subs = [
      Keyboard.addListener("keyboardWillChangeFrame", move),
      Keyboard.addListener("keyboardWillHide", () => setKeyboard(0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  const slot = useMemo(() => ({ setBar }), []);
  return (
    <Slot.Provider value={slot}>
      <View style={{ flex: 1 }}>{children}</View>
      {bar && keyboard > 0 && (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: keyboard }}>
          {bar}
        </View>
      )}
    </Slot.Provider>
  );
}

export function KeyboardBar({ visible, children }) {
  const slot = useContext(Slot);
  useEffect(() => {
    slot?.setBar(visible ? children : null);
  });
  useEffect(() => () => slot?.setBar(null), [slot]);
  return null;
}
