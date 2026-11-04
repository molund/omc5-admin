// The frame around the desk on the phone: scrolling, clear of the notch and home bar, and lifted above the keyboard.
import { ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTw } from "../theme/tw.js";

export function Frame({ children }) {
  const { tw } = useTw();
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={tw`flex-1 bg-bg`}>
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`px-4 pb-10`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
