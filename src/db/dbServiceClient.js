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

export async function getTournamentStats(username, isRecent = false) {
    const dbServiceUrl = process.env.DB_SERVICE_URL || "http://localhost:4000";
    const token = createServiceToken();

    try {
        const url = new URL(`${dbServiceUrl}/api/v1/r6stats/tournament/${encodeURIComponent(username)}`);
        if (isRecent) url.searchParams.set("recent", "true");

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
            }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            const errBody = await response.text();
            throw new Error(`Failed to fetch tournament stats: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        return data.stats;
    } catch (err) {
        console.error("[dbServiceClient] getTournamentStats error:", err);
        throw err;
    }
}

export async function getRecentTournamentMatch() {
    const dbServiceUrl = process.env.DB_SERVICE_URL || "http://localhost:4000";
    const token = createServiceToken();

    try {
        const response = await fetch(`${dbServiceUrl}/api/v1/r6stats/tournament/match/recent`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
            }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            const errBody = await response.text();
            throw new Error(`Failed to fetch recent tournament match: ${response.status} - ${errBody}`);
        }

        return await response.json();
    } catch (err) {
        console.error("[dbServiceClient] getRecentTournamentMatch error:", err);
        throw err;
    }
}

export async function getPersonalStats(username, limit = 10) {
    const dbServiceUrl = process.env.DB_SERVICE_URL || "http://localhost:4000";
    const token = createServiceToken();

    try {
        const url = new URL(`${dbServiceUrl}/api/v1/r6stats/personal/${encodeURIComponent(username)}`);
        url.searchParams.set("limit", limit.toString());

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
            }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            const errBody = await response.text();
            throw new Error(`Failed to fetch personal stats: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        return data.stats;
    } catch (err) {
        console.error("[dbServiceClient] getPersonalStats error:", err);
        throw err;
    }
}
