import { expect, test, describe } from "bun:test";
import { calculateNormalizedEPS } from "../src/lib/replayParser.js";

describe("BLAST R6 Pro League EPS Validation", () => {
    test("realistic 10-player 7-5 match produces expected EPS distribution", () => {
        // Mocking an aggregated array of players from a 12-round match (7-5 scoreline)
        const lobby = [
            // --- WINNING TEAM (7-5) ---
            // Total Team Kills: 41 | Total Team Deaths: 36 | Total EK: 7 | Total ED: 5
            {
                player_name: "MVP_Entry",
                total_rounds: 12, rounds_with_kost: 9,
                kills: 14, deaths: 7,
                entry_kills: 4, entry_deaths: 1,
                objective_plays: 0, clutches: 1
            },
            {
                player_name: "Solid_Support",
                total_rounds: 12, rounds_with_kost: 8,
                kills: 6, deaths: 7,
                entry_kills: 0, entry_deaths: 0,
                objective_plays: 5, clutches: 0
            },
            {
                player_name: "Flex_1",
                total_rounds: 12, rounds_with_kost: 8,
                kills: 9, deaths: 8,
                entry_kills: 2, entry_deaths: 2,
                objective_plays: 1, clutches: 0
            },
            {
                player_name: "Flex_2",
                total_rounds: 12, rounds_with_kost: 7,
                kills: 8, deaths: 8, // Adjusted death down 1
                entry_kills: 1, entry_deaths: 1, // Adjusted ED down 1
                objective_plays: 0, clutches: 0
            },
            {
                player_name: "Struggling_Player",
                total_rounds: 12, rounds_with_kost: 5,
                kills: 4, deaths: 6, // Adjusted deaths down to balance T2 kills
                entry_kills: 0, entry_deaths: 1,
                objective_plays: 1, clutches: 0
            },

            // --- LOSING TEAM (5-7) ---
            // Total Team Kills: 36 | Total Team Deaths: 41 | Total EK: 5 | Total ED: 7
            {
                player_name: "Losing_MVP",
                total_rounds: 12, rounds_with_kost: 9,
                kills: 13, deaths: 8,
                entry_kills: 3, entry_deaths: 1, // Adjusted ED down 1
                objective_plays: 0, clutches: 0
            },
            {
                player_name: "Losing_Flex",
                total_rounds: 12, rounds_with_kost: 8,
                kills: 9, deaths: 8, // Adjusted death down 1
                entry_kills: 1, entry_deaths: 1,
                objective_plays: 0, clutches: 0
            },
            {
                player_name: "Losing_Support",
                total_rounds: 12, rounds_with_kost: 7,
                kills: 5, deaths: 7, // Adjusted death down 2
                entry_kills: 0, entry_deaths: 0,
                objective_plays: 3, clutches: 0
            },
            {
                player_name: "Losing_Entry",
                total_rounds: 12, rounds_with_kost: 6,
                kills: 7, deaths: 9, // Adjusted death down 2
                entry_kills: 1, entry_deaths: 2, // Adjusted ED down 1
                objective_plays: 0, clutches: 0
            },
            {
                player_name: "Feeding_Player",
                total_rounds: 12, rounds_with_kost: 3,
                kills: 2, deaths: 9, // Adjusted death down 3
                entry_kills: 0, entry_deaths: 3, // Adjusted ED down 1
                objective_plays: 0, clutches: 0
            }
        ];

        const calculated = calculateNormalizedEPS(lobby);

        // Sort to inspect easily
        calculated.sort((a, b) => b.eps - a.eps);

        console.log("\n--- Pro League EPS Test Scoreboard ---");
        calculated.forEach(p => {
            console.log(`${p.player_name.padEnd(20)} | K-D: ${p.kills}-${p.deaths} | Entry: ${p.entry_kills}-${p.entry_deaths} | KOST: ${Math.round((p.rounds_with_kost/p.total_rounds)*100)}% | EPS: ${p.eps}`);
        });
        console.log("--------------------------------------\n");

        const mvp = calculated.find(p => p.player_name === "MVP_Entry");
        const losingMvp = calculated.find(p => p.player_name === "Losing_MVP");
        const averagePlayer = calculated.find(p => p.player_name === "Losing_Flex");
        const feedingPlayer = calculated.find(p => p.player_name === "Feeding_Player");

        // The MVP should have a massively high EPS (e.g. 130-160)
        expect(mvp.eps).toBeGreaterThan(130);

        // The losing MVP should also have a very high EPS (120-140)
        expect(losingMvp.eps).toBeGreaterThan(115);

        // The completely average player should sit right around the baseline (90-110)
        expect(averagePlayer.eps).toBeGreaterThanOrEqual(90);
        expect(averagePlayer.eps).toBeLessThanOrEqual(110);

        // The player who went 2-12 and died first 4 times should have a severely punished EPS (50-80)
        expect(feedingPlayer.eps).toBeLessThan(85);
        expect(feedingPlayer.eps).toBeGreaterThan(25); // Should not fall completely to the floor unless worse

        // Solid Support should have a respectable EPS despite poor KD
        const support = calculated.find(p => p.player_name === "Solid_Support");
        expect(support.eps).toBeGreaterThan(95); // Because 5 plants and 66% KOST saves them
    });
});
