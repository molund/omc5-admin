// The map's progress card, as a version of status.yaml would leave it (by the card's new time-stamp rule), drawn like
// src/ProgressCard.svelte in molund/omc5. It's in the opposite theme to the app's, so it stands apart from the form around it:
// the site's dark card when the app is light, and its light card when the app is dark. The close button is only a picture of
// the site's: nothing here is pressed.
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { ThemeContext, useTw } from "../theme/tw.js";
import { cardAsOf } from "../lib/time.js";
import { Icon } from "./Icon";
import { Label } from "./ui.js";

const LOGO = "https://clayton-clipper.olund.ca/images/logo.png";
const PROGRESS = "#8473a8"; // PROGRESS_COLOUR in the site's src/lib/layerSwitches.js
const GOLD = "#b8944a"; // the word beside the logo (.eyebrow span in the site's src/app.css)

function Card({ card }) {
  const { tw, colors } = useTw();
  const [logoFailed, setLogoFailed] = useState(false);
  const figure = { textDecorationLine: "underline", textDecorationStyle: "dotted", textDecorationColor: colors.mute };
  const when = cardAsOf(card.updated);
  return (
    <View
      style={[
        tw`self-start rounded-lg border border-line bg-panel px-3.5 pb-3.5 pt-3`,
        { width: 240, maxWidth: "100%", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)" },
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
      <View style={tw`absolute right-1.5 top-1.5 p-1`}>
        <Icon name="close" color={colors.mute} size={18} />
      </View>
      <Text style={tw`mb-2 mt-0.5 text-base text-mute`}>
        <Text style={[tw`text-3xl font-semibold text-ink`, figure]}>{card.span ?? "–"}</Text>
        {"  (+"}
        <Text style={[tw`font-semibold text-ink`, figure]}>{card.ahead}</Text>
        {") / "}
        <Text style={[tw`font-semibold text-ink`, figure]}>{card.total}</Text>
      </Text>
      <View style={tw`h-6 overflow-hidden rounded-md bg-line`}>
        <View style={[tw`h-full rounded-md`, { width: `${card.percent}%`, backgroundColor: PROGRESS }]} />
        <View
          style={[
            tw`absolute bottom-0 left-0 top-0 items-center justify-center`,
            { width: `${card.percent}%`, minWidth: 48 },
          ]}
        >
          <Text style={[tw`text-xs font-semibold`, figure, { color: "#ffffff", textDecorationColor: "#ffffff" }]}>
            {Math.round(card.percent)}%
          </Text>
        </View>
      </View>
      {when ? <Text style={tw`mt-2 text-xs text-mute`}>As of {when}</Text> : null}
      {card.text ? <Text style={tw`mt-2 text-sm text-ink`}>{card.text}</Text> : null}
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
