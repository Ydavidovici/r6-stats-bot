import jwt from "jsonwebtoken"; // assuming jsonwebtoken is installed, need to verify

// Create a service token for authentication
function createServiceToken() {
    const issuer = process.env.JWT_ISSUER || "http://dss-auth";
    const audience = process.env.JWT_AUDIENCE || "db-service";
    const secret = process.env.JWT_SECRET || "change-me-in-production";

    const payload = {
        sub: "client_auth",
    };

    try {
        return jwt.sign(payload, secret, {
            algorithm: "HS256",
            expiresIn: "1h",
            issuer: issuer,
            audience: audience,
        });
    } catch (err) {
        console.error("JWT sign error", err);
        return "dev-token";
    }
}

export async function pushMatchToDbService({match, rounds, playerStats, matchPlayerStats, rawReplays}) {
    const dbServiceUrl = process.env.DB_SERVICE_URL || "http://localhost:4000";
    const token = createServiceToken();

    try {
        const response = await fetch(`${dbServiceUrl}/api/v1/r6stats/match`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({match, rounds, playerStats, matchPlayerStats, rawReplays}),
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
