// A view kept clear of the iPhone's status bar and home indicator, for a full-screen Modal, which is drawn outside the
// frame's own safe area (platform/Frame.native.js). The web has no such bars in the Claude app: SafeArea.web.js.
export { SafeAreaView as SafeArea } from "react-native-safe-area-context";
