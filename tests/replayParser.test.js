import {expect, test, describe} from "bun:test";
import {parseReplayData} from "../src/lib/replayParser.js";

const mockDissectJson = {
    matchId: "test-match-123",
    map: "Clubhouse",
    timestamp: "2026-06-14T00:00:00Z",
    rounds: [
        {
            roundNumber: 1,
            site: "CCTV",
            winner: "Defense",
            players: [
                {name: "PlayerA", team: "Attack"},
                {name: "PlayerB", team: "Defense"},
                {name: "PlayerC", team: "Attack"},
            ],
            matchFeedback: [
                {type: "Kill", timeInSeconds: 15, killer: {name: "PlayerA", team: "Attack"}, target: {name: "PlayerB", team: "Defense"}, headshot: true},
                {type: "Kill", timeInSeconds: 20, killer: {name: "PlayerB", team: "Defense"}, target: {name: "PlayerA", team: "Attack"}, headshot: false}, // Wait, PlayerB was dead, but just simulating Trade
                {type: "Kill", timeInSeconds: 22, killer: {name: "PlayerC", team: "Attack"}, target: {name: "PlayerB", team: "Defense"}, headshot: false},
            ],
        },
        {
            roundNumber: 2,
            site: "Gym",
            winner: "Attack",
            players: [
                {name: "PlayerA", team: "Attack"},
                {name: "PlayerD", team: "Defense"},
            ],
            matchFeedback: [
                {type: "DefuserPlantComplete", timeInSeconds: 120, player: {name: "PlayerA"}},
            ],
        },
    ],
};

describe("Replay Parser", () => {
    test("calculates KOST and Entry stats correctly", () => {
        const result = parseReplayData(mockDissectJson);

        expect(result.match.id).toBe("test-match-123");
        expect(result.rounds.length).toBe(2);

        const playerA_R1 = result.playerStats.find(p => p.player_name === "PlayerA" && p.round_number === 1);
        expect(playerA_R1.kills).toBe(1);
        expect(playerA_R1.headshots).toBe(1);
        expect(playerA_R1.is_entry_kill).toBe(true);
        expect(playerA_R1.has_kost).toBe(true); // Got a kill
        expect(playerA_R1.is_traded).toBe(true); // Died at 20s, traded at 22s

        const playerA_R2 = result.playerStats.find(p => p.player_name === "PlayerA" && p.round_number === 2);
        expect(playerA_R2.objective_play).toBe(true);
        expect(playerA_R2.has_kost).toBe(true); // Planted defuser
        expect(playerA_R2.survived).toBe(true); // Didn't die

        const playerB_R1 = result.playerStats.find(p => p.player_name === "PlayerB" && p.round_number === 1);
        expect(playerB_R1.is_entry_death).toBe(true);
    });

    test("EPS calculation sanity check", () => {
        const result = parseReplayData(mockDissectJson);
        const matchPlayerA = result.matchPlayerStats.find(p => p.player_name === "PlayerA");
        
        // Z-score calculation, should be valid number
        expect(matchPlayerA.eps).toBeGreaterThan(0);
    });
});
