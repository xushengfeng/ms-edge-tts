import { MsEdgeTTS, OUTPUT_FORMAT } from "../src/index";

const tts = new MsEdgeTTS();
console.log(tts);
await tts.setMetadata("en-GB-LibbyNeural", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);

const readable = tts.toStream("Agriculture has come a long way from its ancient beginnings.");

readable.onEnd((data) => {
    console.log(data);
});
