// The phone's light or dark setting, as "light" or "dark". (scheme.web.js reads the Claude app's choice on the web.)
import { useColorScheme } from "react-native";

export function useScheme() {
  return useColorScheme() === "dark" ? "dark" : "light";
}
