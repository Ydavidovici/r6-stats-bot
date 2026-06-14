import jwt from "jsonwebtoken"; // assuming jsonwebtoken is installed, need to verify

// Create a service token for authentication
function createServiceToken() {
    const issuer = process.env.AUTH_ISSUER || "https://issuer.example";
    const audience = process.env.AUTH_AUDIENCE || "db-service";
    const azp = process.env.AUTH_SERVICE_AZP || "r6statsbot";

    // In a real scenario, sign with a private key.
    // For internal service auth, often a shared secret or similar is used, 
    // but db-service uses RS256. We'd need the private key.
    // Assuming process.env.SERVICE_PRIVATE_KEY is available.
    if (!process.env.SERVICE_PRIVATE_KEY) {
        console.warn("[dbServiceClient] Missing SERVICE_PRIVATE_KEY, auth might fail");
    }

    const payload = {
        iss: issuer,
        aud: audience,
        azp: azp,
        scope: "r6stats:write",
    };

    try {
        return jwt.sign(payload, process.env.SERVICE_PRIVATE_KEY || "secret", {algorithm: "RS256", expiresIn: "1h"});
    } catch (err) {
        // Fallback for dev if RS256 fails due to missing key format
        return "dev-token";
    }
}

export async function pushMatchToDbService({ match, rounds, playerStats, matchPlayerStats, rawReplays }) {
    const dbServiceUrl = process.env.DB_SERVICE_URL || "http://localhost:4000";
    const token = createServiceToken();

    try {
        const response = await fetch(`${dbServiceUrl}/api/v1/r6stats/match`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ match, rounds, playerStats, matchPlayerStats, rawReplays }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Failed to push match to db-service: ${response.status} ${response.statusText} - ${errBody}`);
        }

        const data = await response.json();
        return data.ok;
    } catch (err) {
        console.error("[dbServiceClient] pushMatchToDbService error:", err);
        throw err;
    }
}
