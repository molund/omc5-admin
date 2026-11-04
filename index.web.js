// The web entry (the Claude app): react-native-web draws the app into #root. Native builds use index.js.
import { AppRegistry } from "react-native";
import App from "./src/App.js";

AppRegistry.registerComponent("StatusDesk", () => App);
AppRegistry.runApplication("StatusDesk", { rootTag: document.getElementById("root") });
