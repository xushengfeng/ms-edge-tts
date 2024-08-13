# MsEdgeTTS

[![npm version](https://badge.fury.io/js/msedge-tts-browserify.svg)](https://badge.fury.io/js/msedge-tts-browserify)

msedge-tts-browserify clone from [Migushthe2nd/MsEdgeTTS](https://github.com/Migushthe2nd/MsEdgeTTS/tree/2a74a806e18aa595d69f6f5d03481965a6e78820), which based on nodejs. To better use it on browser, I rewrite some codes--remove node `stream`, `fs` and `crypto`, replace `axios` with `fetch`. This repo **only** support browser but nodejs.

An simple Azure Speech Service module that uses the Microsoft Edge Read Aloud API.

~~Full support for SSML~~ Only supports `speak`, `voice`, and `prosody` element types. The following is the default SSML object:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts"
       xml:lang="${this._voiceLang}">
    <voice name="${voiceName}">
        <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
            ${input}
        </prosody>
    </voice>
</speak>
```

Documentation on the SSML
format [can be found here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-synthesis-markup)
. All supported audio formats [can be found here](./src/OUTPUT_FORMAT.ts).

## Example usage

Make sure to **escape/sanitize** your user's input!
Use a library like [xml-escape](https://www.npmjs.com/package/xml-escape).

### Write to stream

```js
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const tts = new MsEdgeTTS();
await tts.setMetadata("en-IE-ConnorNeural", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
const readable = tts.toStream("Hi, how are you?");

readable.on("data", (data) => {
    console.log("DATA RECEIVED", data);
    // raw audio file data
});

readable.on("close", () => {
    console.log("STREAM CLOSED");
});
```

## API

This library only supports promises.
