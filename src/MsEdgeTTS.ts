import { Buffer } from "buffer";
import { OUTPUT_FORMAT } from "./OUTPUT_FORMAT";
import { PITCH } from "./PITCH";
import { RATE } from "./RATE";
import { VOLUME } from "./VOLUME";

function generateRandomValue(length: number) {
    let cryptoObj = window.crypto;
    let randomValues = new Uint8Array(length);
    cryptoObj.getRandomValues(randomValues);
    return Array.from(randomValues, function (byte) {
        return ("0" + byte.toString(16)).slice(-2);
    }).join("");
}

class s {
    eventListeners: { [key: string]: ((...arg) => void)[] } = {};
    end = false;
    constructor() {
        this.eventListeners = {};
    }

    push(item: any) {
        if (item) {
            this.emit("data", item);
        } else {
            if (!this.end) {
                this.emit("end", null);
                this.end = true;
            } else {
                this.emit("closed", null);
            }
        }
    }

    on(eventName: string, callback: (...arg) => void) {
        if (!this.eventListeners[eventName]) {
            this.eventListeners[eventName] = [];
        }
        this.eventListeners[eventName].push(callback);
    }

    emit(eventName: string, data: any) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach((callback) => {
                callback(data);
            });
        }
    }
}

export type Voice = {
    Name: string;
    ShortName: string;
    Gender: string;
    Locale: string;
    SuggestedCodec: string;
    FriendlyName: string;
    Status: string;
};

export class ProsodyOptions {
    /**
     * The pitch to use.
     * Can be any {@link PITCH}, or a relative frequency in Hz (+50Hz), a relative semitone (+2st), or a relative percentage (+50%).
     * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,pitch,-Indicates%20the%20baseline)
     */
    pitch?: PITCH | string = "+0Hz";
    /**
     * The rate to use.
     * Can be any {@link RATE}, or a relative number (0.5), or string with a relative percentage (+50%).
     * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,rate,-Indicates%20the%20speaking)
     */
    rate?: RATE | string | number = 1.0;
    /**
     * The volume to use.
     * Can be any {@link VOLUME}, or an absolute number (0, 100), a string with a relative number (+50), or a relative percentage (+50%).
     * [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#:~:text=Optional-,volume,-Indicates%20the%20volume)
     */
    volume?: VOLUME | string | number = 100.0;
}

export class MsEdgeTTS {
    static OUTPUT_FORMAT = OUTPUT_FORMAT;
    private static TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private static VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${MsEdgeTTS.TRUSTED_CLIENT_TOKEN}`;
    private static SYNTH_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${MsEdgeTTS.TRUSTED_CLIENT_TOKEN}`;
    private static BINARY_DELIM = "Path:audio\r\n";
    private static VOICE_LANG_REGEX = /\w{2}-\w{2}/;
    private readonly _enableLogger;
    private readonly _isBrowser: boolean;
    private _ws: WebSocket;
    private _voice;
    private _voiceLocale;
    private _outputFormat;
    private _queue: { [key: string]: s } = {};
    private _startTime = 0;

    private _log(...o: any[]) {
        if (this._enableLogger) {
            console.log(...o);
        }
    }

    /**
     * Create a new `MsEdgeTTS` instance.
     *
     * @param agent (optional, **NOT SUPPORTED IN BROWSER**) Use a custom http.Agent implementation like [https-proxy-agent](https://github.com/TooTallNate/proxy-agents) or [socks-proxy-agent](https://github.com/TooTallNate/proxy-agents/tree/main/packages/socks-proxy-agent).
     * @param enableLogger=false whether to enable the built-in logger. This logs connections inits, disconnects, and incoming data to the console
     */
    public constructor(agent?, enableLogger: boolean = false) {
        this._enableLogger = enableLogger;
        this._isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
    }

    private async _send(message) {
        for (let i = 1; i <= 3 && this._ws.readyState !== this._ws.OPEN; i++) {
            if (i == 1) {
                this._startTime = Date.now();
            }
            this._log("connecting: ", i);
            await this._initClient();
        }
        this._ws.send(message);
    }

    private _initClient() {
        this._ws = new WebSocket(MsEdgeTTS.SYNTH_URL);

        this._ws.binaryType = "arraybuffer";
        return new Promise((resolve, reject) => {
            this._ws.onopen = () => {
                this._log("Connected in", (Date.now() - this._startTime) / 1000, "seconds");
                this._send(
                    `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
                    {
                        "context": {
                            "synthesis": {
                                "audio": {
                                    "metadataoptions": {
                                        "sentenceBoundaryEnabled": "false",
                                        "wordBoundaryEnabled": "false"
                                    },
                                    "outputFormat": "${this._outputFormat}" 
                                }
                            }
                        }
                    }
                `
                ).then(resolve);
            };
            this._ws.onmessage = (m) => {
                const buffer = Buffer.from(m.data as ArrayBuffer);
                const message = buffer.toString();
                const requestId = /X-RequestId:(.*?)\r\n/gm.exec(message)[1];
                if (message.includes("Path:turn.start")) {
                    // start of turn, ignore
                } else if (message.includes("Path:turn.end")) {
                    // end of turn, close stream
                    this._queue[requestId].push(null);
                } else if (message.includes("Path:response")) {
                    // context response, ignore
                } else if (message.includes("Path:audio")) {
                    if (m.data instanceof ArrayBuffer) {
                        this.cacheAudioData(buffer, requestId);
                    } else {
                        this._log("UNKNOWN MESSAGE", message);
                    }
                } else {
                    this._log("UNKNOWN MESSAGE", message);
                }
            };
            this._ws.onclose = () => {
                this._log("disconnected after:", (Date.now() - this._startTime) / 1000, "seconds");
                for (const requestId in this._queue) {
                    this._queue[requestId].push(null);
                }
            };
            this._ws.onerror = function (error) {
                reject("Connect Error: " + error);
            };
        });
    }

    private cacheAudioData(m: Buffer, requestId: string) {
        const index = m.indexOf(MsEdgeTTS.BINARY_DELIM) + MsEdgeTTS.BINARY_DELIM.length;
        const audioData = m.slice(index, m.length);
        this._queue[requestId].push(audioData);
        this._log("receive audio chunk size: ", audioData?.length);
    }

    private _SSMLTemplate(input: string, options: ProsodyOptions = new ProsodyOptions()): string {
        // in case future updates to the edge API block these elements, we'll be concatenating strings.
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${this._voiceLocale}">
                <voice name="${this._voice}">
                    <prosody pitch="${options.pitch}" rate="${options.rate}" volume="${options.volume}">
                        ${input}
                    </prosody> 
                </voice>
            </speak>`;
    }

    /**
     * Fetch the list of voices available in Microsoft Edge.
     * These, however, are not all. The complete list of voices supported by this module [can be found here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support) (neural, standard, and preview).
     */
    getVoices(): Promise<Voice[]> {
        return new Promise((resolve, reject) => {
            fetch(MsEdgeTTS.VOICES_URL, {
                method: "get",
            })
                .then((json) => json.json())
                .then((res) => resolve(res))
                .catch(reject);
        });
    }

    /**
     * Sets the required information for the speech to be synthesised and inits a new WebSocket connection.
     * Must be called at least once before text can be synthesised.
     * Saved in this instance. Can be called at any time times to update the metadata.
     *
     * @param voiceName a string with any `ShortName`. A list of all available neural voices can be found [here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#neural-voices). However, it is not limited to neural voices: standard voices can also be used. A list of standard voices can be found [here](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#standard-voices)
     * @param outputFormat any {@link OUTPUT_FORMAT}
     * @param voiceLocale (optional) any voice locale that is supported by the voice. See the list of all voices for compatibility. If not provided, the locale will be inferred from the `voiceName`
     */
    async setMetadata(voiceName: string, outputFormat: OUTPUT_FORMAT, voiceLocale?: string) {
        const oldVoice = this._voice;
        const oldVoiceLocale = this._voiceLocale;
        const oldOutputFormat = this._outputFormat;

        this._voice = voiceName;
        this._voiceLocale = voiceLocale;
        if (!this._voiceLocale) {
            const voiceLangMatch = MsEdgeTTS.VOICE_LANG_REGEX.exec(this._voice);
            if (!voiceLangMatch) throw new Error("Could not infer voiceLocale from voiceName!");
            this._voiceLocale = voiceLangMatch[0];
        }
        this._outputFormat = outputFormat;

        const changed =
            oldVoice !== this._voice || oldVoiceLocale !== this._voiceLocale || oldOutputFormat !== this._outputFormat;

        // create new client
        if (changed || this._ws.readyState !== this._ws.OPEN) {
            this._startTime = Date.now();
            await this._initClient();
        }
    }

    private _metadataCheck() {
        if (!this._ws)
            throw new Error("Speech synthesis not configured yet. Run setMetadata before calling toStream or toFile.");
    }

    /**
     * Close the WebSocket connection.
     */
    close() {
        this._ws.close();
    }

    /**
     * Writes raw audio synthesised from text in real-time to a {@link stream.Readable}. Uses a basic {@link _SSMLTemplate SML template}.
     *
     * @param input the text to synthesise. Can include SSML elements.
     * @param options (optional) {@link ProsodyOptions}
     * @returns {stream.Readable} - a `stream.Readable` with the audio data
     */
    toStream(input, options?: ProsodyOptions): s {
        return this._rawSSMLRequest(this._SSMLTemplate(input, options));
    }

    /**
     * Writes raw audio synthesised from a request in real-time to a {@link stream.Readable}. Has no SSML template. Basic SSML should be provided in the request.
     *
     * @param requestSSML the SSML to send. SSML elements required in order to work.
     * @returns {stream.Readable} - a `stream.Readable` with the audio data
     */
    rawToStream(requestSSML): s {
        return this._rawSSMLRequest(requestSSML);
    }

    private _rawSSMLRequest(requestSSML): s {
        this._metadataCheck();

        const requestId = generateRandomValue(16);
        const request =
            `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n
                ` + requestSSML.trim();
        // https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-synthesis-markup
        const readable = new s();
        this._queue[requestId] = readable;
        this._send(request).then();
        return readable;
    }
}
