// The frame around the desk on the phone: scrolling, clear of the notch and home bar, and lifted above the keyboard, with
// the slot for the rich text toolbar on top of the keyboard.
import { ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTw } from "../theme/tw.js";
import { KeyboardBarHost } from "../components/KeyboardBar";

export function Frame({ children }) {
  const { tw } = useTw();
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <KeyboardBarHost>
        <SafeAreaView style={tw`flex-1 bg-bg`}>
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
        </SafeAreaView>
      </KeyboardBarHost>
    </SafeAreaProvider>
  );
}
