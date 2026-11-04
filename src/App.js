// Clipper Status Desk: a little CMS for the Clayton Clipper site's status.yaml, in four modes.
import { useState } from "react";
import { Text, View } from "react-native";
import { ThemeContext, themes, useTw } from "./theme/tw.js";
import { Frame } from "./platform/Frame";
import { useScheme } from "./platform/scheme";
import { DeskProvider, useDesk } from "./state/desk.js";
import { load, save } from "./platform/storage";
import { Segmented, Body, Notice, Button } from "./components/ui.js";
import { Outbox } from "./components/Outbox.js";
import { ReviewSheet } from "./components/ReviewSheet.js";
import { MoveScreen } from "./screens/MoveScreen.js";
import { UpdateScreen } from "./screens/UpdateScreen.js";
import { FollowUpScreen } from "./screens/FollowUpScreen.js";
import { BlogScreen } from "./screens/BlogScreen.js";

const MODES = [
  {
    value: "move",
    label: "Position",
    icon: "crosshair",
    screen: MoveScreen,
    about: "Position only: the span and Complete, with a time stamp.",
  },
  { value: "update", label: "Update", screen: UpdateScreen, about: "A status update. Its summary goes on the card." },
  {
    value: "followup",
    label: "Follow-up",
    screen: FollowUpScreen,
    about: "Add to an update or blog post, or edit a follow-up.",
  },
  { value: "blog", label: "Blog", screen: BlogScreen, about: "A dated piece for Trackside. The card stays as it is." },
];

function Desk() {
  const { tw } = useTw();
  const desk = useDesk();
  const [mode, setModeState] = useState(() => load("mode", "move"));
  const setMode = (m) => {
    setModeState(m);
    save("mode", m);
  };
  const [review, setReview] = useState(null); // { change, after, cardLabel }
  const current = MODES.find((m) => m.value === mode) ?? MODES[0];
  const Screen = current.screen;

  return (
    <View style={[tw`w-full gap-3.5 self-center py-5`, { maxWidth: 640 }]}>
      <View style={tw`gap-1`}>
        <Text style={tw`text-xs font-bold uppercase tracking-widest text-mute`}>Clayton Clipper · status.yaml</Text>
        <Text accessibilityRole="header" style={tw`text-2xl font-bold text-ink`}>
          Status desk
        </Text>
      </View>

      {desk.error && (
        <View style={tw`gap-2`}>
          <Notice tone="problem">{desk.error}</Notice>
          <Button title="Try again" onPress={desk.reload} />
        </View>
      )}
      {!desk.ready && !desk.error && <Body mute>Reading the desk's copy of status.yaml…</Body>}

      {desk.ready && (
        <>
          <Outbox />
          {review && (
            <View style={tw`gap-3`}>
              <Text accessibilityRole="header" style={tw`text-lg font-bold text-ink`}>
                Review
              </Text>
              <ReviewSheet
                change={review.change}
                cardLabel={review.cardLabel}
                onBack={() => setReview(null)}
                onSave={(message) => {
                  desk.addChange(review.change, message);
                  review.after?.();
                  setReview(null);
                }}
              />
            </View>
          )}
          {/* the screen stays mounted under the review, so saving can clear its draft */}
          <View style={[tw`gap-3`, review && { display: "none" }]}>
            <Segmented options={MODES} value={mode} onChange={setMode} />
            <Body small mute>
              {current.about}
            </Body>
            <Screen key={mode} onReview={(change, opts = {}) => setReview({ change, ...opts })} />
          </View>
        </>
      )}
    </View>
  );
}

export default function App() {
  const scheme = useScheme();
  return (
    <ThemeContext.Provider value={themes[scheme] ?? themes.light}>
      <DeskProvider>
        <Frame>
          <Desk />
        </Frame>
      </DeskProvider>
    </ThemeContext.Provider>
  );
}
