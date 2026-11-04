// The native entry (iOS): Expo draws the app. On the web, index.web.js is used instead.
import { registerRootComponent } from "expo";
import App from "./src/App";

registerRootComponent(App);
