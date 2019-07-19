const logger = require('../log.js');
const util = require('../util.js');
const _ = require('underscore');
const uuidv1 = require('uuid/v1');

class DeckService {
    constructor(db) {
        this.decks = db.get('decks');
    }

    getById(id) {
        return this.decks.findOne({ _id: id })
            .catch(err => {
                logger.error('Unable to fetch deck', err);
                throw new Error('Unable to fetch deck ' + id);
            });
    }

    getSealedDeck() {
        return this.decks.aggregate([{ $match: { includeInSealed: true } }, { $sample: { size: 1 } }]);
    }

    getByUuid(uuid) {
        return this.decks.findOne({ uuid: uuid })
            .catch(err => {
                logger.error('Unable to fetch deck', err);
                throw new Error('Unable to fetch deck ' + uuid);
            });
    }

    findByUserName(userName) {
        let decks = this.decks.find({ username: userName, banned: false }, { sort: { lastUpdated: -1 } });
        return decks;
    }

    async createCustom(deck) {
        let uuid = uuidv1();
        let cardnames = deck.custom.slice(1,-1).split(',');
        let cards = cardnames.map(card => {
            let card_and_count = card.split("_");
            let card_id = card_and_count[0];
            let card_count = parseInt(card_and_count[1]);
            return { id: card_id, count: card_count };
        });
        return await this.decks.insert({
            username: deck.username,
            uuid: uuid,
            identity: 'Custom Deck ' + uuid,
            cardback: '',
            name: 'Custom Deck ' + uuid,
            banned: false,
            flagged: false,
            verified: true,
            includeInSealed: false,
            houses: ['mars', 'logos', 'sanctum'],
            cards: cards,
            lastUpdated: new Date()
        });
    }

    async create(deck) {
        if(deck.custom) {
            return this.createCustom(deck);
        }

        let deckResponse;

        try {
            let response = await util.httpRequest(`https://www.keyforgegame.com/api/decks/${deck.uuid}/?links=cards`);

            if(response[0] === '<') {
                logger.error('Deck failed to import', deck.uuid, response);

                return;
            }

            deckResponse = JSON.parse(response);
        } catch(error) {
            logger.error('Unable to import deck', deck.uuid, error);

            return;
        }

        if(!deckResponse || !deckResponse._linked || !deckResponse.data) {
            return;
        }

        let cards = deckResponse._linked.cards.map(card => {
            let id = card.card_title.toLowerCase().replace(/[,?.!"„“”]/gi, '').replace(/[ '’]/gi, '-');
            if(card.is_maverick) {
                return { id: id, count: 1, maverick: card.house.toLowerCase() };
            }
            return { id: id, count: deckResponse.data._links.cards.filter(uuid => uuid === card.id).length };
        });
        let uuid = deckResponse.data.id;

        let illegalCard = cards.find(card => !card.id.split('').every(char => 'æabcdefghijklmnopqrstuvwxyz0123456789-[]'.includes(char)));
        if(!illegalCard) {
            let otherDecks = await this.decks.find({ uuid: uuid });
            otherDecks = _.uniq(otherDecks, deck => deck.username);
            if(otherDecks.length >= 3) {
                await this.decks.update({ uuid: uuid }, { '$set': { flagged: true } }, { multi: true });
            }
            return await this.decks.insert({
                username: deck.username,
                uuid: uuid,
                identity: deckResponse.data.name.toLowerCase().replace(/[,?.!"„“”]/gi, '').replace(/[ '’]/gi, '-'),
                cardback: '',
                name: deckResponse.data.name,
                banned: false,
                flagged: otherDecks.length >= 3,
                verified: false,
                includeInSealed: false,
                houses: deckResponse.data._links.houses.map(house => house.toLowerCase()),
                cards: cards,
                lastUpdated: new Date()
            });
        }

        logger.error(`DECK IMPORT ERROR: ${illegalCard.id.split('').map(char => char.charCodeAt(0))}`);
    }

    update(deck) {
        let properties = {
            verified: deck.verified,
            lastUpdated: new Date()
        };

        return this.decks.update({ _id: deck.id }, { '$set': properties });
    }

    delete(id) {
        return this.decks.remove({ _id: id });
    }

    async getFlaggedUnverifiedDecksForUser(username) {
        return await this.decks.find({ username: username, verified: false, flagged: true });
    }

    async verifyDecksForUser(username) {
        return await this.decks.update({username: username, verified: false, flagged: true}, {$set: { verified: true }}, { multi: true });
    }
}

module.exports = DeckService;

