// Clipper Status Desk: a little CMS for the Clayton Clipper site's status.yaml. It opens on Home (screens/HomeScreen.js),
// and every form opens as its own page over it, on a stack: Back, or a swipe from the left edge, goes back one.
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { ThemeContext, themes, useTw } from "./theme/tw.js";
import { Frame } from "./platform/Frame";
import { useScheme } from "./platform/scheme";
import { BeforeChange, DeskProvider, useDesk } from "./state/desk.js";
import { Body, Notice, Button, ZoomScope } from "./components/ui.js";
import { ReviewSheet } from "./components/ReviewSheet.js";
import { VelocityPanel } from "./components/VelocityPanel.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { MoveScreen } from "./screens/MoveScreen.js";
import { UpdateScreen } from "./screens/UpdateScreen.js";
import { FollowUpScreen, NoUpdateWarning } from "./screens/FollowUpScreen.js";
import { BlogScreen } from "./screens/BlogScreen.js";
import { EntriesScreen } from "./screens/EntriesScreen.js";
import { EntryScreen } from "./screens/EntryScreen.js";
import { recentUpdates, waitingAt } from "./lib/entries.js";
import { WaitingEditor } from "./components/WaitingEditor.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { Icon } from "./components/Icon";
import { useBack } from "./components/backContext.js";

// the pages over Home: their titles, and for the ways to add something, what each one is
const PAGES = {
  move: { title: "Position", screen: MoveScreen, about: "Position only: the span and Hung, with a time stamp." },
  update: { title: "Update", screen: UpdateScreen, about: "A status update. Its summary goes on the card." },
  followup: {
    title: "Addendum",
    screen: FollowUpScreen,
    about: "Add to today's or yesterday's update, or edit an addendum.",
  },
  blog: { title: "Blog post", screen: BlogScreen, about: "A dated piece for Trackside. The card stays as it is." },
  velocity: { title: "Velocity" },
  entries: { title: "Entries" },
  entry: { title: "Edit" },
  waiting: { title: "Waiting change" },
  settings: { title: "Settings" },
};

// Piper on every page's header: the site's favicon (public/favicon.ico in molund/omc5), transparent
const LOGO = require("../assets/logo.png");

// what an entry is, in its page's title
const EDITS = { update: "update", blog: "blog post", position: "position", followup: "addendum" };

/** The review of a reopened waiting change sees the files as they were before it, as its editor does. */
const InReview = ({ id, children }) => (id ? <BeforeChange id={id}>{children}</BeforeChange> : children);

function Desk() {
  const { tw, colors } = useTw();
  const desk = useDesk();
  // the pages open, Home first: { page }, { page: "entry", target } for a saved entry, or { page: "waiting", id } for a
  // waiting change reopened
  const [stack, setStack] = useState([{ page: "home" }]);
  const top = stack[stack.length - 1];
  const go = (page, more) => setStack((s) => [...s, { page, ...more }]);
  const [review, setReview] = useState(null); // { change, after, cardLabel, warning }
  const reopened = top.page === "waiting" ? desk.changes.find((c) => c.id === top.id) : null;
  const startReview = (change, opts = {}) => setReview({ change, ...opts });
  const reopen = (change) => {
    setReview(null);
    go("waiting", { id: change.id });
  };
  // a saved entry opens on its own page; one with a change still waiting opens that change instead
  const openEntry = (target) => {
    const waiting = waitingAt(desk.changes, target.key);
    if (waiting) reopen(waiting);
    else go("entry", { target });
  };
  // Back closes a review first, then the page
  const back = () => {
    if (review) return setReview(null);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  // the frame's swipe from the left edge does the same, while there's somewhere to go back to
  useBack(review || stack.length > 1 ? back : null, stack.length - 1 + (review ? 1 : 0));
  const home = top.page === "home";
  const page = PAGES[top.page];
  const canFollowUp = recentUpdates(desk.parsed).length > 0;

  let screen = null;
  if (top.page === "home") screen = <HomeScreen go={go} onEdit={reopen} onOpen={openEntry} />;
  else if (top.page === "settings") screen = <SettingsScreen />;
  else if (top.page === "velocity") screen = <VelocityPanel full />;
  else if (top.page === "entries") screen = <EntriesScreen onOpen={openEntry} />;
  else if (top.page === "entry")
    screen = <EntryScreen key={top.target.key} target={top.target} onReview={startReview} />;
  else if (top.page === "waiting")
    screen = reopened ? (
      <BeforeChange id={reopened.id}>
        <WaitingEditor key={reopened.id} change={reopened} onCancel={back} onReview={startReview} />
      </BeforeChange>
    ) : (
      <Notice>That change isn't waiting any more.</Notice>
    );
  else if (top.page === "followup" && !canFollowUp) screen = <NoUpdateWarning />;
  else {
    const Screen = page.screen;
    screen = <Screen key={top.page} onReview={startReview} />;
  }

  return (
    <View style={[tw`w-full gap-3.5 self-center py-5`, { maxWidth: 640 }]}>
      <View style={tw`flex-row items-end justify-between gap-2`}>
        <View style={tw`flex-1 gap-1`}>
          {home ? (
            <Text style={tw`text-xs font-bold uppercase tracking-widest text-mute`}>Clayton Clipper Tracker</Text>
          ) : (
            <Button kind="link" small title="‹ Back" style={tw`self-start py-0`} onPress={back} />
          )}
          <View style={tw`flex-row items-center gap-2.5`}>
            <Image source={LOGO} style={tw`h-10 w-10`} />
            <Text accessibilityRole="header" style={tw`flex-1 text-2xl font-bold text-ink`}>
              {review
                ? "Review"
                : home
                  ? "Status desk"
                  : top.page === "entry"
                    ? `Edit ${EDITS[top.target.type]}`
                    : page.title}
            </Text>
          </View>
          {!review && page?.about && (
            <Body small mute>
              {page.about}
            </Body>
          )}
        </View>
        {home && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => go("settings")}
            style={({ pressed, hovered }) => [
              tw`h-10 w-10 items-center justify-center rounded-md border border-button-line bg-button-bg`,
              (pressed || hovered) && tw`opacity-80`,
            ]}
          >
            <Icon name="gear" color={colors.ink} size={20} />
          </Pressable>
        )}
      </View>

      {desk.error && (
        <View style={tw`gap-2`}>
          <Notice tone="problem">{desk.error}</Notice>
          <Button title="Try again" onPress={desk.reload} />
        </View>
      )}
      {!desk.ready && !desk.error && <Body mute>Reading the desk's copy of status.yaml…</Body>}

      {(desk.ready || top.page === "settings") && (
        <>
          {review && (
            <InReview id={reopened?.id}>
              <ReviewSheet
                change={review.change}
                cardLabel={review.cardLabel}
                warning={review.warning}
                onBack={() => setReview(null)}
                onSave={(message) => {
                  if (reopened) desk.replaceChange(reopened.id, review.change, message);
                  else desk.addChange(review.change, message);
                  review.after?.();
                  setReview(null);
                  // saved: back to where the page was opened from (saving clears every form's draft)
                  setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
                }}
              />
            </InReview>
          )}
          {/* the page stays mounted under the review, so going back to it keeps it as it was */}
          <View style={[tw`gap-3`, review && { display: "none" }]}>{screen}</View>
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
          <ZoomScope>
            <Desk />
          </ZoomScope>
        </Frame>
      </DeskProvider>
    </ThemeContext.Provider>
  );
}
