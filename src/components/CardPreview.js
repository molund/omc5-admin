// The map's progress card, as a version of status.yaml would leave it (by the card's new time-stamp rule).
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { asOf } from "../lib/time.js";
import { Body, Label } from "./ui.js";

export function CardPreview({ card, label = "The card will show" }) {
  const { tw } = useTw();
  return (
    <View style={tw`gap-1.5`}>
      <Label>{label}</Label>
      <View style={[tw`gap-2 self-start rounded-lg border border-line bg-panel px-3.5 pb-3.5 pt-3`, { width: 240, maxWidth: "100%" }]}>
        <View style={tw`flex-row items-center gap-2`}>
          <Body style={tw`font-bold italic`}>Clayton Clipper</Body>
          <Body small mute style={tw`text-xs font-bold uppercase tracking-widest`}>
            Progress
          </Body>
        </View>
        <Body style={tw`text-base font-semibold`}>
          Span {card.span} · {card.complete ? "complete" : "not complete"}
        </Body>
        {card.updated ? (
          <Body small mute>
            As of {asOf(card.updated)}
          </Body>
        ) : null}
        {card.text ? <Body>{card.text}</Body> : null}
        <View
          style={tw`items-center rounded-md border py-1.5 ${card.button === "comments" ? "border-line bg-panel" : "border-button-line bg-button-bg"}`}
        >
          <Body style={tw`font-semibold`}>{card.button === "comments" ? "💬 Comments" : "Trackside →"}</Body>
        </View>
      </View>
    </View>
  );
}
