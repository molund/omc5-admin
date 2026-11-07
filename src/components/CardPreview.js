// The map's progress card, as a version of status.yaml would leave it (by the card's new time-stamp rule), drawn like
// src/ProgressCard.svelte in molund/omc5. It's in the opposite theme to the app's, so it stands apart from the form around it:
// the site's dark card when the app is light, and its light card when the app is dark. Nothing here is pressed, so it has
// no close button, unlike the site's.
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { ThemeContext, themes, useTw } from "../theme/tw.js";
import { cardAsOf } from "../lib/time.js";
import { inline } from "../lib/inline.js";
import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";
import { Label } from "./ui.js";

const LOGO = "https://clayton-clipper.olund.ca/images/logo.png";
const PROGRESS = "#8473a8"; // PROGRESS_COLOUR in the site's src/lib/layerSwitches.js
const GOLD = "#b8944a"; // the word beside the logo (.eyebrow span in the site's src/app.css)
// the spans per week chart's colour, [light, dark] (--up and --down in the site's src/app.css)
const UP = ["#4f8a6b", "#7fbf9a"];
const DOWN = ["#b0564f", "#e0928b"];
// how far up each figure's box its dots sit, so that the big figure's and the small ones' fall on one line
const BIG_DROP = 2;
const SMALL_DROP = 2;

/** A figure with the site's dotted line under it. It's a row of dots, not a text underline, so every figure's sits the same. */
function Figure({ children, textStyle, color, drop }) {
  return (
    <View>
      <Text style={textStyle}>{children}</Text>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: drop,
          height: 1.5,
          flexDirection: "row",
          gap: 1.5,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 20 }, (_, i) => (
          <View key={i} style={{ width: 1.5, height: 1.5, borderRadius: 1, backgroundColor: color }} />
        ))}
      </View>
    </View>
  );
}

function Card({ card }) {
  const { tw, colors } = useTw();
  const [logoFailed, setLogoFailed] = useState(false);
  const when = cardAsOf(card.updated);
  return (
    <View
      style={[
        tw`self-start rounded-lg border border-line bg-panel px-3.5 pb-3.5 pt-3`,
        { width: 276, maxWidth: "100%", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)" },
      ]}
    >
      <View style={tw`flex-row items-center gap-2 pr-6`}>
        {logoFailed ? (
          <Text style={tw`text-xs font-bold text-ink`}>Clayton Clipper</Text>
        ) : (
          <Image
            accessibilityLabel="Clayton Clipper"
            source={{ uri: LOGO }}
            onError={() => setLogoFailed(true)}
            style={{ width: 70, height: 44, marginTop: -5, marginBottom: 5, marginLeft: -3 }}
          />
        )}
        <Text style={[tw`text-xs font-bold uppercase`, { color: GOLD, letterSpacing: 3.6 }]}>Progress</Text>
      </View>
      <View style={tw`mb-2 mt-0.5 flex-row flex-wrap items-baseline`}>
        <Figure textStyle={tw`text-3xl font-semibold text-ink`} color={colors.mute} drop={BIG_DROP}>
          {card.span ?? "–"}
        </Figure>
        <Text style={tw`text-base text-mute`}>{"  (+"}</Text>
        <Figure textStyle={tw`text-base font-semibold text-ink`} color={colors.mute} drop={SMALL_DROP}>
          {card.ahead}
        </Figure>
        <Text style={tw`text-base text-mute`}>{") / "}</Text>
        <Figure textStyle={tw`text-base font-semibold text-ink`} color={colors.mute} drop={SMALL_DROP}>
          {card.total}
        </Figure>
        <Text style={tw`text-base text-mute`}>{" spans"}</Text>
      </View>
      <View style={tw`h-6 overflow-hidden rounded-md bg-line`}>
        <View style={[tw`h-full rounded-md`, { width: `${card.percent}%`, backgroundColor: PROGRESS }]} />
        <View
          style={[
            tw`absolute bottom-0 left-0 top-0 items-center justify-center`,
            { width: `${card.percent}%`, minWidth: 48 },
          ]}
        >
          <Figure textStyle={[tw`text-xs font-semibold`, { color: "#ffffff" }]} color="#ffffff" drop={0}>
            {Math.round(card.percent)}%
          </Figure>
        </View>
      </View>
      {/* "〰 2.83 spans/wk velocity": the chart green going up, red going down, grey flat, in the site's shade for this
          card's theme */}
      {card.pace ? (
        // the figure dotted underneath, as the site's has a tip
        <View style={tw`mt-2 flex-row flex-wrap items-center`}>
          {card.chart ? (
            <View style={tw`mr-1.5`}>
              <Sparkline
                chart={card.chart}
                color={
                  card.chart.way === "flat"
                    ? colors.mute
                    : (card.chart.way === "up" ? UP : DOWN)[colors === themes.dark.colors ? 1 : 0]
                }
              />
            </View>
          ) : null}
          <Figure textStyle={tw`text-sm font-semibold text-ink`} color={colors.mute} drop={SMALL_DROP}>
            {card.pace}
          </Figure>
          <Text style={tw`text-sm text-mute`}>{" spans/wk velocity"}</Text>
        </View>
      ) : null}
      {when ? <Text style={tw`mt-2 text-xs text-mute`}>As of {when}</Text> : null}
      {card.text ? (
        <Text style={tw`mt-2 text-sm text-ink`}>
          {/* its links and bold as the site shows them; the links are only a picture, like the rest of the card */}
          {inline(card.text).map((p, i) => (
            <Text key={i} style={[p.bold && tw`font-bold`, p.href && tw`text-link`]}>
              {p.text}
            </Text>
          ))}
        </Text>
      ) : null}
      {card.button === "comments" ? (
        <View style={tw`mt-2.5 min-h-8 flex-row items-center gap-1.5 rounded-md border border-line bg-panel px-2.5`}>
          <Icon name="comment" color={colors.ink} />
          <Text style={tw`text-sm text-ink`}>Comments</Text>
        </View>
      ) : (
        <View
          style={tw`mt-2.5 min-h-8 flex-row items-center justify-center gap-1.5 rounded-md border border-button-line bg-button-bg px-2.5`}
        >
          <Text style={tw`text-sm font-semibold text-button-ink`}>Trackside</Text>
          <Text style={tw`text-sm font-semibold text-button-ink`}>→</Text>
        </View>
      )}
    </View>
  );
}

export function CardPreview({ card, label = "The card will show" }) {
  const { tw, inverse } = useTw();
  return (
    <View style={tw`gap-1.5`}>
      <Label>{label}</Label>
      <ThemeContext.Provider value={inverse}>
        <Card card={card} />
      </ThemeContext.Provider>
    </View>
  );
}
