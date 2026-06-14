import { Dissect } from "r6-dissect";

async function run() {
    try {
        const dissect = new Dissect();
        console.log("Initializing dissect...");
        // just pass any folder, it will try to download the binary
        await dissect.match("dummy");
    } catch (err) {
        console.error("Dissect error:", err);
    }
}
run();
setTimeout(() => { process.exit(0); }, 3000);
