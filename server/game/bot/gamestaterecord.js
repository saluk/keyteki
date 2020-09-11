class GameStateRecord {
    constructor(game) {
        this.game = game;
        Object.assign(this, this.relevantState(game));
    }
    scorePlayer(relevantPlayerData) {
        let s = 0;
        let forgebase = 3;
        let forgescale = 1.2;
        let now = 3; // Multiply times values that we currently have locked
        let soon = 2; // Multiply times values we can get next turn
        let later = 1; // Multiply times values that are elusive
        s += forgebase ** (relevantPlayerData.forged * forgescale);
        s += (relevantPlayerData.amber / relevantPlayerData.keyCost) * 6 * now;
        let houses = {};
        for (let card of relevantPlayerData.hand) {
            for (let house of card.houses) {
                let sc = 1 * soon;
                houses[house] = houses[house] ? houses[house] + sc : sc;
            }
        }
        for (let card of relevantPlayerData.archived) {
            for (let house of card.houses) {
                let sc = 1 * later;
                houses[house] = houses[house] ? houses[house] + sc : sc;
            }
        }
        for (let card of relevantPlayerData.cardsInPlay) {
            for (let house of card.houses) {
                let sc = 1 * later;
                houses[house] = houses[house] ? houses[house] + sc : sc;
            }
        }
        if (houses) {
            s += Math.max(...Object.values(houses));
        }
        return s;
    }
    // Enough state to make ai value judgements on previous actions
    relevantCardState(cardlist) {
        let relevant = [];
        if (!cardlist) {
            return [];
        }
        for (let card of cardlist) {
            relevant.push({
                name: card.name,
                type: card.type,
                uuid: card.uuid,
                tokens: card.tokens,
                traits: card.getTraits(),
                houses: card.getHouses(),
                power: card.power,
                armor: card.armor,
                stunnded: card.stunned,
                exhausted: card.exhausted,
                upgrades: this.relevantCardState(card.upgrades),
                controller: card.getModifiedController().name,
                leftFlank: card.isOnFlank('left'),
                rightFlank: card.isOnFlank('right'),
                center: card.isInCenter()
            });
        }
        return relevant;
    }
    relevantPlayerState(player) {
        let data = {};
        data.name = player.name;
        data.hand = this.relevantCardState(player.hand);
        data.cardsInPlay = this.relevantCardState(player.cardsInPlay);
        data.deckSize = player.deck.length;
        data.discard = this.relevantCardState(player.discard);
        data.purged = this.relevantCardState(player.purged);
        data.archived = this.relevantCardState(player.archived);
        data.chains = player.chains;
        data.activeHouse = player.activeHouse;
        data.keysForgedThisRound = player.keysForgedThisRound;
        data.forged = player.getForgedKeys();
        data.keyCost = player.getCurrentKeyCost();
        data.amber = player.amber;
        return data;
    }
    relevantState(game) {
        let data = {};
        data.winner = game.winner ? game.winner.name : undefined;
        data.activePlayer = game.activePlayer ? game.activePlayer.name : undefined;
        data.activePlayerActions = this.activePlayerActions(game);
        for (let player of game.getPlayers()) {
            data[player.name] = this.relevantPlayerState(player);
            data[player.name].score = this.scorePlayer(data[player.name]);
        }
        for (let player of game.getPlayers()) {
            for (let player2 of game.getPlayers()) {
                if(player2 != player) {
                    data[player.name].scoreDelta = data[player.name].score - data[player2.name].score;
                }
            }
        }
        return data;
    }
    activePlayerActions(game) {
        let actions = [];
        if (!game.activePlayer) {
            return ['no active player'];
        }
        for (let location of [
            game.activePlayer.hand,
            game.activePlayer.archives,
            game.activePlayer.cardsInPlay,
            game.activePlayer.deck,
            game.activePlayer.purged
        ]) {
            for (let card of location) {
                actions = actions.concat(card.getLegalActions(game.activePlayer));
            }
        }
        // Maybe insert event triggers here
        // Maybe prune for card actions that can't be taken if that is not already covered
        return actions;
    }
    debug() {
        let data = {};
        for (let key in this) {
            if (key === 'game') {
                continue;
            }
            if (key === 'activePlayerActions') {
                data[key] = this.debugActions(this[key]);
                continue;
            }
            data[key] = this[key];
            if (key === 'player1' || key === 'player2') {
                for (let key2 in this[key]) {
                    if (
                        key2 === 'hand' ||
                        key2 === 'cardsInPlay' ||
                        key2 === 'purged' ||
                        key2 === 'archived' ||
                        key2 === 'discard'
                    ) {
                        data[key][key2] = _.map(this[key][key2], (card) =>
                            this.debugCard(card, key)
                        );
                    }
                }
            }
        }
        return data;
    }
    debugActions(actions) {
        let results = [];
        let cards = {};
        let i = 0;
        for (let action of actions) {
            let ci = i;
            if (action.card.uuid in cards) {
                ci = cards[action.card.uuid];
            } else {
                cards[action.card.uuid] = i;
                i += 1;
            }
            results.push(
                '' + ci + ' ' + action.card.name + '[' + action.card.location + ']:' + action.title
            );
        }
        return results;
    }
    debugCard(card, locationController) {
        let data = card.name + '(';
        for (let key in card) {
            if (key === 'actions' || key === 'name' || key === 'uuid') {
                continue;
            }
            if (key === 'controller' && card[key] === locationController) {
                continue;
            }
            if (
                card[key] == 0 ||
                card[key] == false ||
                key === 'type' ||
                card[key] == {} ||
                card[key] == []
            ) {
                continue;
            }
            if (key === 'upgrades') {
                data +=
                    'upgrades(' +
                    _.map(card[key], (upgrade) => {
                        return this.debugCard(upgrade, locationController);
                    }).join(',') +
                    '), ';
                continue;
            }
            if (card[key] == true) {
                data += key + ', ';
                continue;
            }
            if (key === 'tokens') {
                let tokens = this.debugTokens(card[key]);
                if (tokens.length <= 2) {
                    continue;
                }
                data += ' ' + tokens + ', ';
                continue;
            }
            data += key + '-' + card[key] + ', ';
        }
        return data.slice(0, data.length) + ')';
    }
    debugTokens(tokens) {
        let data = '[';
        for (let key in tokens) {
            if (tokens[key] == 0 || !tokens[key]) {
                continue;
            }
            data += key + ':' + tokens[key] + ' ';
        }
        return data.slice(0, data.length) + ']';
    }
}

module.exports = GameStateRecord;