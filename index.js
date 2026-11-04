// The React Native entry. On the web (the Claude app), react-native-web draws the app into #root.
import { AppRegistry } from "react-native";
import App from "./src/App.js";

AppRegistry.registerComponent("StatusDesk", () => App);
AppRegistry.runApplication("StatusDesk", { rootTag: document.getElementById("root") });
