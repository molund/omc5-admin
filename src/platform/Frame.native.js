// The frame around the desk on the phone: scrolling, clear of the notch and home bar, and lifted above the keyboard, with
// the slot for the rich text toolbar on top of the keyboard. A swipe from the left edge goes back a page (useBack in
// components/backContext.js): the page follows the finger, and goes when it's let go a third of the way across, or flicked.
import { useMemo, useRef } from "react";
import { Animated, PanResponder, ScrollView, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTw } from "../theme/tw.js";
import { KeyboardBarHost } from "../components/KeyboardBar";
import { BackContext } from "../components/backContext.js";

const EDGE = 24; // how near the left edge a swipe starts

export function Frame({ children }) {
  const { tw } = useTw();
  const { width } = useWindowDimensions();
  const back = useRef(null);
  const x = useRef(new Animated.Value(0)).current;
  const wide = useRef(width);
  wide.current = width;
  const frame = useMemo(() => ({ set: (f) => (back.current = f) }), []);
  const swipe = useMemo(() => {
    const settle = () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      // only a sideways drag that starts at the left edge, so taps, scrolling and selecting text are left alone
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !!back.current && g.x0 <= EDGE && g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (!back.current || (g.dx < wide.current / 3 && g.vx < 0.5)) return settle();
        Animated.timing(x, { toValue: wide.current, duration: 150, useNativeDriver: true }).start(() => {
          back.current?.();
          x.setValue(0);
        });
      },
      onPanResponderTerminate: settle,
    });
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <KeyboardBarHost>
        <SafeAreaView style={tw`flex-1 bg-bg`}>
          <BackContext.Provider value={frame}>
            <Animated.View style={[tw`flex-1`, { transform: [{ translateX: x }] }]} {...swipe.panHandlers}>
              <ScrollView
                style={tw`flex-1`}
                contentContainerStyle={tw`px-4 pb-10`}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                delaysContentTouches={false}
                automaticallyAdjustKeyboardInsets
              >
                {children}
              </ScrollView>
            </Animated.View>
          </BackContext.Provider>
        </SafeAreaView>
      </KeyboardBarHost>
    </SafeAreaProvider>
  );
}
