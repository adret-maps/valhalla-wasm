import { handle } from "/spike/core.mjs";
self.onmessage = ({ data }) => handle(data, (m) => self.postMessage(m));
