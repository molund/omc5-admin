// "Turn it into an update" and "Turn it into an addendum", for a position: a new one (Position), a waiting one reopened, or a
// pushed one being edited. With no update from today or yesterday the addendum link is dimmed, and says why when pressed.
import { useRef, useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { RULE } from "../screens/FollowUpScreen.js";
import { Link, useTapAway, Warning } from "./ui.js";

/**
 * @param {object} props
 * @param {object} [props.under] The update an addendum would go under, or nothing when there isn't one.
 * @param {() => void} props.onUpdate
 * @param {() => void} props.onAddendum
 */
export function TurnIntoLinks({ under, onUpdate, onAddendum }) {
  const { tw } = useTw();
  const [why, setWhy] = useState(false); // the note on why the addendum link is off, shown after it's pressed
  // pressing the link while the note is open is a tap anywhere too, so it closes it, and the press mustn't open it again
  const closedAt = useRef(0);
  useTapAway(why, () => {
    closedAt.current = Date.now();
    setWhy(false);
  });
  return (
    <View style={tw`gap-2`}>
      <Link title="Turn it into an update" onPress={onUpdate} />
      {under ? (
        <Link title="Turn it into an addendum" onPress={onAddendum} />
      ) : (
        <View style={tw`opacity-40`}>
          <Link
            label="Turn it into an addendum, not available: press to see why"
            title="Turn it into an addendum"
            onPress={() => Date.now() - closedAt.current > 100 && setWhy(true)}
          />
        </View>
      )}
      {!under && why && <Warning>{RULE} There isn't one right now, so there's nothing to add to.</Warning>}
    </View>
  );
}
