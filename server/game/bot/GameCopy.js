const lo = require('lodash');
const _ = require('underscore');
const util = require('util');
const { assert } = require('console');

const CARD_FIELDS = [
    'cardsInPlay', 'discard', 'archives', 'purged', 'deck', 'hand'
];

class GameCopy {

/*[
  'game',              'image',
  'id',                'facedown',
  'uuid',              'effects',
  'user',              'emailHash',
  'owner',             'hand',
  'cardsInPlay',       'deckCards',
  'discard',           'purged',
  'archives',          'wins',
  'houses',            'activeHouse',
  'deckData',          'takenMulligan',
  'chains',            'keysForgedThisRound',
  'clock',             'showDeck',
  'role',              'avatar',
  'playableLocations', 'optionSettings',
  'promptState',       'deck',
  'allCards',          'keys',
  'amber',             'turn',
  'readyToStart',      'opponent',
  'lobbyId',           'connectionSucceeded',
  'socket'
]
*/
    savePlayer(player) {
        let clone = {};
        //console.log(Object.keys(player));
        clone.allCardsSave = [];
        for(const card of player.allCards) {
            let cardData = {
            };
            for(const key of [
                'facedown', 'uuid', 'tokens', 'traits', 'enhancements', 'clonedNeighbors',
                'armorUsed', 'exhausted', 'stunned', 'moribund', 'isFighting',
                'elusiveUsed', 'modifiedPower', 'location', 'new'
            ]) {
                cardData[key] = lo.cloneDeep(card[key]);
            }
            cardData.menu = lo.cloneDeep(card.menu);
            //cardData.abilities = lo.cloneDeep(card.abilities);
            //cardData.effects = lo.cloneDeep(card.effects);
            cardData.controllerSave = card.controller.name;
            cardData.upgradesSave = _.filter(function(upgrade){
                return upgrade.uuid;
            }, card.upgrades);
            if(card.parent) {
                cardData.parentSave = card.parent.uuid;
            }
            cardData.childCardsSave = _.filter(function(child){
                return child.uuid;
            });
            clone.allCardsSave.push(cardData);
        }
        for(const key of CARD_FIELDS) {
            clone[key+'Save'] = _.filter(function(card) {
                return card.uuid;
            })
        }
        for(const attr of [
            'houses', 'chains', 'clock', 'role', 'playableLocations', 'promptState',
            'amber', 'readyToStart', 'lobbyId', 'facedown', 'effects', 'wins',
            'activeHouse', 'takenMulligan', 'keysForgedThisRound', 'showDeck',
            'keys', 'turn'
        ]) {
            clone[attr] = lo.cloneDeep(player[attr]);
        }
        return clone;
    }

    restorePlayer(state, player, game) {
        let cardByUUID = function(uuid) {
            for(const card of player.allCards) {
                if(card.uuid === uuid) {
                    return card;
                }
            }
        }
        for(const cardData of state.allCardsSave) {
            if(cardData.controllerSave) {
                cardByUUID(cardData.uuid).controller = game.playersAndSpectators[cardData.controllerSave];
                delete cardData.controllerSave;
            }

            cardByUUID(cardData.uuid).upgrades = _.filter(function(upgradeUUID) {
                return cardByUUID(upgradeUUID);
            }, cardData.upgradesSave);
            delete cardData.upgradesSave;

            if(cardData.parentSave) {
                cardByUUID(cardData.uuid).parent = cardByUUID(cardData.parentSave);
                delete cardData.parentSave;
            }

            cardByUUID(cardData.uuid).childCards = _.filter(function(childUUID) {
                return cardByUUID(childUUID);
            }, cardData.childCardsSave);
            delete cardData.childCardsSave;
        }

        for(const key of CARD_FIELDS) {
            cardByUUID[key] = _.filter(function(uuid) {
                return uuid;
            }, state[key+'Save']);
            delete state[key+'Save'];
        }

        Object.assign(player, state);
        player.promptState.player = player;
    }

    savePipeline(pipeline) {
        let clone = {}
        clone.pipeline = lo.cloneDeep(pipeline.pipeline);
        clone.queue = lo.cloneDeep(pipeline.queue);
        let allsteps = [];
        let seen = [];
        allsteps = allsteps.concat(clone.pipeline);
        allsteps = allsteps.concat(clone.queue);
        if(clone.steps) {
            allsteps = allsteps.concat(clone.steps);
        }
        while(allsteps.length>0) {
            let nextStep = allsteps.pop();
            if(!nextStep || _.contains(seen, nextStep)) {
                continue;
            }
            if(nextStep.pipeline) {
                allsteps = allsteps.concat(nextStep.pipeline.pipeline);
                allsteps = allsteps.concat(nextStep.pipeline.queue);
            }
            if(nextStep.steps) {
                allsteps =  allsteps.concat(nextStep.steps);
            }
            nextStep.game = null;
            seen.push(nextStep);
        }
        return clone;
    }

    restorePipeline(state, pipeline, game) {
        Object.assign(pipeline, state);
        let allsteps = [];
        let seen = [];
        allsteps = allsteps.concat(pipeline.pipeline);
        allsteps = allsteps.concat(pipeline.queue);
        if(pipeline.steps) {
            allsteps = allsteps.concat(pipeline.steps);
        }
        while(allsteps.length>0) {
            let nextStep = allsteps.pop();
            if(!nextStep || _.contains(seen, nextStep)) {
                continue;
            }
            if(nextStep.pipeline) {
                allsteps = allsteps.concat(nextStep.pipeline.pipeline);
                allsteps = allsteps.concat(nextStep.pipeline.queue);
            }
            if(nextStep.steps) {
                allsteps =  allsteps.concat(nextStep.steps);
            }
            nextStep.game = game;
            seen.push(nextStep);
        }
    }

    saveEffectEngine(effectEngine) {
        let clone = {}
        for(const key of ['effects', 'delayedEffects', 'terminalConditions', 'customDurationEvents', 'newEffect']) {
            clone[key] = effectEngine[key];
        }
        if(effectEngine.events) {
            clone.events = lo.cloneDeep(effectEngine.events);
            delete clone.events.game;
        }
        return clone;
    }

    restoreEffectEngine(state, effectEngine, game) {
        if(state.events) {
            Object.assign(effectEngine.events, state.events);
            delete state.events;
        }
        Object.assign(effectEngine, state);
        if(effectEngine.events) {
            effectEngine.events.game = game;
        }
    }

    /*
    [
  '_events',              '_eventsCount',         '_maxListeners',
  'adaptive',             'allowSpectators',      'cancelPromptUsed',
  'challonge',            'chatCommands',         'createdAt',
  'currentAbilityWindow', 'currentActionWindow',  'currentEventWindow',
  'currentPhase',         'effectEngine',         'gameChat',
  'gameFormat',           'gamePrivate',          'gameTimeLimit',
  'gameType',             'hideDecklists',        'id',
  'manualMode',           'muteSpectators',       'name',
  'owner',                'password',             'pipeline',
  'playStarted',          'playersAndSpectators', 'previousWinner',
  'savedGameId',          'showHand',             'started',
  'swap',                 'timeLimit',            'useGameTimeLimit',
  'cardsUsed',            'cardsPlayed',          'cardsDiscarded',
  'effectsUsed',          'activePlayer',         'cardData',
  'cardVisibility',       'router',               'allCards',
  'startedAt',            'round'
]
    */
    saveGame(game) {
        //console.log(util.inspect(game, true, 4));
        let clone = {};
        clone.players = {};
        if(game.activePlayer){
            clone.activePlayer = game.activePlayer.name;
        }
        for(const name in game.playersAndSpectators) {
            clone.players[name] = this.savePlayer(game.playersAndSpectators[name]);
        }
        clone.pipeline = this.savePipeline(game.pipeline);
        clone.effectEngine = this.saveEffectEngine(game.effectEngine);
        for(const key of ['currentAbilityWindow', 'currentActionWindow', 'currentEventWindow',
                    'currentPhase', 'gameChat', 'cardsUsed', 'cardsPlayed',
                    'cardsDiscarded', 'effectsUsed', '_events', 'playStarted', 'swap',
                    'startedAt', '_eventsCount', 'round',
                    'cancelPromptUsed', 'started']
        ) {
            clone[key] = lo.cloneDeep(game[key]);
        }
        return clone;
    }

    restoreGame(state, game) {
        for(const name in state.players) {
            console.log('restore player '+name);
            this.restorePlayer(state.players[name], game.playersAndSpectators[name], game);
        }
        delete state.players;
        if(state.activePlayer) {
            game.activePlayer = game.playersAndSpectators[state.activePlayer];
            console.log('current active player '+game.activePlayer.name);
            console.log('restore active player '+state.activePlayer+' '+game.activePlayer.name);
            delete state.activePlayer;
        } else {
            console.log('no active player');
            game.activePlayer = null;
        }
        if(state.pipeline) {
            console.log('restore pipeline');
            this.restorePipeline(state.pipeline, game.pipeline, game);
            delete state.pipeline;
        }
        if(state.effectEngine) {
            console.log('restore effect engine');
            this.restoreEffectEngine(state.effectEngine, game.effectEngine, game);
            delete state.effectEngine;
        }
        //console.log(state);
        Object.assign(game, state);
    }
}

module.exports = GameCopy;