// The progress card's text (`card-text:` in status.yaml) and the last day it shows: a few words for the map's card that
// aren't an update, so Trackside never shows them. A position's own words, or the card's text edited on its own.
import { useMemo } from "react";
import { Text } from "react-native";
import { useTw } from "../theme/tw.js";
import { shiftKey, shortDate } from "../lib/time.js";
import { Body, Field, Panel, Row, Stepper } from "./ui.js";

const looks = (tw) => ({
  optional: tw`font-normal text-mute`,
});

/** The later of two days, "2026-11-04". */
const later = (a, b) => (a > b ? a : b);

/**
 * @param {object} props
 * @param {string} props.value The text ("" for none).
 * @param {string} props.until The last day it shows, BC time, "2026-11-04".
 * @param {string} props.floor The earliest day it can end: the day it's posted.
 * @param {(text: string) => void} props.onChange
 * @param {(day: string) => void} props.onUntil
 */
export function CardTextField({ value, until, floor, onChange, onUntil }) {
  const { tw } = useTw();
  const s = useMemo(() => looks(tw), [tw]);
  const day = later(until, floor);
  return (
    <Panel>
      <Field
        multiline
        heading={
          <>
            Card text <Text style={s.optional}>(optional)</Text>
          </>
        }
        value={value}
        onChangeText={onChange}
        placeholder="A few words for the map's progress card, not on Trackside"
        label="Card text"
        writes="a short line for the map's progress card"
      />
      {!!value.trim() && (
        <Row>
          <Body>Shows until the end of</Body>
          <Stepper
            wide
            label="Shows until"
            value={shortDate(day)}
            onMinus={() => onUntil(later(shiftKey(day, -24 * 60), floor))}
            onPlus={() => onUntil(shiftKey(day, 24 * 60))}
          />
        </Row>
      )}
    </Panel>
  );
}
