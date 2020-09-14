const _ = require('underscore');
const lo = require('lodash');
const util = require('util');
const logger = require('../../log');
const GameStateRecord = require('./gamestaterecord');
const ActionRecordItem = require('./ActionRecordItem');
const GameCopy = require('./GameCopy');

const Player = require('../player.js');
const Card = require('../Card.js');
const Game = require('../game.js');

// For the bot to interact
const PlayerInteractionWrapper = require('../../../test/helpers/playerinteractionwrapper.js');
const BasePlayAction = require('../BaseActions/BasePlayAction');
const DiscardAction = require('../BaseActions/DiscardAction');

class BotRule {
    constructor() {
        this.failed = false;
    }
    applyRule(bot) {
        this.failed = false;
        return this.apply(bot);
    }
    fail() {
        this.failed = true;
    }

    /* Overrides */
    match(bot) {
        return true;
    }
    apply(bot) {
        return;
    }
}

class HandPlusBoard extends BotRule {
    apply(bot) {
        let counts = {};
        for (const card of bot.hand.concat(bot.cardsInPlay)) {
            for (const house of card.getHouses()) {
                counts[house] = counts[house] ? counts[house] + 1 : 1;
            }
        }
        let houses = _.pairs(counts);
        houses.sort(function (a, b) {
            return -(a[1] - b[1]);
        });
        for (let house of houses) {
            bot.speak('I see ' + house[1] + ' cards of house ' + house[0]);
        }
        bot.speak('I choose ' + houses[0][0]);
        try {
            bot.interactor.clickPrompt(houses[0][0]);
        } catch {
            this.fail();
        }
        bot.speak('Cards in my hand:', bot.hand);
    }
}

class RandomPhase extends BotRule {
    apply(bot) {
        let remainingActions = [];
        for (let location of [
            bot.hand,
            bot.cardsInPlay,
            bot.archives,
            bot.deck,
            bot.discard
        ]) {
            for (let card of location) {
                remainingActions = remainingActions.concat(card.getLegalActions());
            }
        }
        for (let action of _.shuffle(remainingActions)) {
            bot.interactor.clickCard(action.card);
            bot.interactor.clickPrompt(action.title);
            return;
        }
        bot.interactor.clickPrompt('End Turn');
    }
}

class PlayPhasePlay extends BotRule {
    match(bot) {
        return bot.hand.filter(
            function(card){
                return card.getLegalActions().filter(function(action){
                    return action instanceof BasePlayAction;
                }).length > 0;
            }
        ).length > 0;
    }
    apply(bot) {
        // If we have a card we can play, play it
        let unplayed = [];
        for (let card of _.shuffle(bot.hand)) {
            let actions = card.getLegalActions();
            bot.speak(
                'legal actions for',
                card,
                actions
                    .map((action) => {
                        return action.title;
                    })
                    .join(', ')
            );
            for (let action of card.getLegalActions()) {
                if (action instanceof BasePlayAction) {
                    bot.speakDebug('Play:' + card.name);
                    bot.speakDebug(action);
                    if (bot.botShouldPlay(card)) {
                        if (card.type === 'creature') {
                            bot.speak('Playing ' + card.name + ' as a creature');
                            // false: Don't know how to deploy yet
                            bot.interactor.play(card, Math.random() >= 0.5, false);
                            return;
                        } else if (card.type === 'upgrade') {
                            let target = bot.botUpgradeTarget(card);
                            if (target) {
                                bot.speak('Playing ' + card.name + ' as an upgrade on ' + target.name);
                                bot.interactor.playUpgrade(card, target);
                                return;
                            }
                        } else {
                            bot.speak('Playing ' + card.name);
                            bot.interactor.play(card);
                            return;
                        }
                    }
                }
            }
            unplayed.push(card);
        }
        if (unplayed.length > 0) {
            bot.speak('Could not play ', unplayed);
        }
        this.fail();
    }
}

class PlayPhaseDiscardAllFromHand extends BotRule {
    match(bot) {
        return bot.hand.filter(
            function(card){
                return card.getLegalActions().filter(function(action){
                    return action instanceof DiscardAction;
                }).length > 0;
            }
        ).length > 0;
    }
    apply(bot) {
        // If we have a card we can play, play it
        let undiscarded = [];
        for (let card of _.shuffle(bot.hand)) {
            for (let action of card.getLegalActions()) {
                if (action instanceof DiscardAction) {
                    bot.speakDebug('Discard:' + card.name);
                    bot.speakDebug(action);
                    bot.interactor.clickCard(action.card);
                    bot.interactor.clickPrompt(action.title);
                    return true;
                }
            }
            undiscarded.push(card);
        }
        if (undiscarded.length > 0) {
            bot.speak('Could not discard ', undiscarded);
        }
        this.fail();
    }
}

const USE_TITLES = {
    'omni': "Use this card's Omni ability",
    'action': "Use this card's Action ability",
    'reap': 'Reap with this creature',
    'fight': 'Fight with this creature'
}

class PlayPhaseUse extends BotRule {
    match(bot) {
        return bot.cardsInPlay.filter(
            function(card){
                return card.getLegalActions().filter(function(action){
                    return _.contains(Object.values(USE_TITLES), action);
                }).length > 0;
            }
        ).length > 0;
    }
    apply(bot) {
        // If we have a card we can use, use it
        let unused = [];
        for (let card of _.shuffle(bot.cardsInPlay)) {
            bot.speakDebug(card.name);
            let actions = card.getLegalActions();
            if (actions.length == 0) {
                continue;
            }
            for (let action of _.shuffle(actions)) {
                bot.speakDebug(action);
                bot.speak('Thinking about action ' + action.title);
                switch (action.title) {
                    case "Use this card's Omni ability":
                        bot.interactor.useAction(card);
                        return;
                    case "Use this card's Action ability":
                        bot.interactor.useAction(card);
                        return;
                    case 'Reap with this creature':
                        bot.interactor.reap(card);
                        return;
                    case 'Fight with this creature':
                        bot.interactor.fightWith(card, _.sample(bot.opponent.cardsInPlay, 1)[0]);
                        return;
                    default:
                        continue;
                }
            }
            unused.push(card);
        }
        if (unused.length > 0) {
            bot.speak('Wanted to use ', unused);
        }
        this.fail()
    }
}

class SelectRandomButton extends BotRule {
    apply(bot) {
        let buttons = _.filter(bot.promptState.buttons, (button) => {
            return button.text !== 'Cancel';
        });
        if(!(buttons.length > 0)) {
            return this.fail();
        }
        bot.speakDebug('Clicking a random button');
        let choice = _.sample(buttons, 1)[0].text;
        bot.speak('Clicking random button of ' + choice);
        bot.interactor.clickPrompt(choice);
    }
}

var debugX = function(x, name) {
    if(x === undefined || x === null){
        console.log('\n'+name+' is undefined or null');
        return;
    }
    console.log('\ndebug: ' + name+' '+x.constructor.name);
    if(x instanceof Array) {
        if(x.length == 0){
            console.log('[]');
            return;
        }
        for(const i in x) {
            debugX(x[i], name + '-' + i);
        }
    } else {
        for(const key in x) {
            if(key === 'player' || key === 'game' || key === 'card') {
                continue;
            }
            console.log(key + '=' + x[key]);
        }
    }
}
var debugY = function(ob, indent, repeats, repeatKeys) {
    if(!indent)
        indent = '';
    if(!repeats)
        repeats = [];
    if(!repeatKeys)
        repeatKeys = [];
    for(const key in ob) {
        let value = ob[key];
        if(_.contains(repeats, value)){
            console.log(indent+key+':repeat>'+repeatKeys[repeats.indexOf(value)]);
            continue;
        }
        if(
            typeof value === 'string' ||
            value instanceof String ||
            (typeof value === 'number' && isFinite(value)) ||
            typeof value === 'function' ||
            value === null ||
            typeof value === 'undefined' ||
            typeof value === 'boolean' ||
            (value && typeof value === 'object' && value.constructor === RegExp)
        ) {
            console.log(indent+key+':'+value);
            continue;
        }
        repeats.push(value);
        repeatKeys.push(key);
        if(value instanceof Card) {
            console.log(indent+key+':Card>'+value.name);
            continue;
        }
        if(key === 'game') {
            console.log(indent+key+':Game');
            continue;
        }
        if(value instanceof Player) {
            console.log(indent+key+':Player>'+value.name);
            continue;
        }
        console.log(indent+key+':'+value.constructor.name);
        debugY(value, indent+'  ', repeats, repeatKeys);
    }
}

var getActionsFromGameAction = function(actionRoot) {
    if(actionRoot == undefined || actionRoot == null)
        return [];
    let actions = [];
    if(actionRoot instanceof Array) {
        for(const action of actionRoot) {
            actions = actions.concat(getActionsFromGameAction(action))
        }
    } else {
        actions.push(actionRoot);
        if(actionRoot.gameActions) {
            actions = actions.concat(getActionsFromGameAction(actionRoot.gameActions));
        }
    }
    return actions;
}
var getActionsFromBase = function(promptStateBase) {
    let actions = [];
    if(promptStateBase.properties)
        actions = actions.concat(getActionsFromGameAction(promptStateBase.properties.gameAction));
    if(promptStateBase.context) {
        for(const target of promptStateBase.context.ability.targets) {
            actions = actions.concat(getActionsFromGameAction(target.properties.gameAction));
        }
    }
    /*if(promptStateBase.context.preThenEvents) {
        for(const event of promptStateBase.context.preThenEvents) {
            actions = actions.concat(getActionsFromGameAction(event.gameAction));
        }
    }*/
    if(promptStateBase.properties.context) {
        actions = actions.concat(getActionsFromGameAction(promptStateBase.properties.context.ability.gameAction));
    }
    let uniqueActions = [];
    for(const action of actions) {
        if(!_.contains(uniqueActions, action))
            uniqueActions.push(action);
    }
    return uniqueActions;
}

var promptHasAction = function(promptState, actionList) {
    console.log(getActionsFromBase(promptState.base).map((action)=>action.name));
    let actionNames = getActionsFromBase(promptState.base).map((action)=>action.name);
    for(const actionName of actionList) {
        if(_.contains(actionNames, actionName))
            return true;
    }
}

var promptText = function(bot) {
    let s = '';
    if(bot.promptState.promptTitle && bot.promptState.promptTitle.search)
        s += bot.promptState.promptTitle + ' ';
    else if(bot.promptState.promptTitle && bot.promptState.promptTitle.text)
        s += bot.promptState.promptTitle.text + ' ';
    if(bot.promptState.menuTitle && bot.promptState.menuTitle.search)
        s += bot.promptState.menuTitle + ' ';
    else if(bot.promptState.menuTitle && bot.promptState.menuTitle.text)
        s += bot.promptState.menuTitle.text + ' ';
    return s;
}

var selectCards = function(bot, possible) {
    if(!bot.promptState.selectableCards || bot.promptState.selectableCards.length == 0){
        return false;
    }
    possible = possible.filter(function(card){
        return _.contains(bot.promptState.selectableCards, card);
    });
    if(possible.length == 0) {
        return false;
    }
    let statedMaximum = bot.promptState.base.selector.numCards;
    let maximum = _.min([(statedMaximum || possible.length), possible.length]);
    console.log('max:'+statedMaximum+' '+maximum);
    let chosen = 0;
    while(chosen < maximum) {
        let card = possible.pop();
        bot.speak('Selecting card ' + card.name);
        bot.interactor.clickCard(card);
        chosen += 1;
    }
    if (!statedMaximum || statedMaximum > 1) {
        bot.speak('No new creature selections to add');
        bot.interactor.clickPrompt('Done');
    }
    return true;
}

class AlwaysExaltMay extends BotRule {
    match(bot) {
        debugY(bot.promptState);
        return promptHasAction(bot.promptState, ['exalt']);
    }
    apply(bot) {
        try {
            bot.interactor.clickPrompt('Yes');
        } catch {
            return this.fail();
        }
    }
}

class AlwaysExaltSelectCards extends BotRule {
    match(bot) {
        return promptHasAction(bot.promptState, ['exalt']);
    }
    apply(bot) {
        let cards = _.shuffle(bot.opponent.cardsInPlay).concat(
            _.shuffle(bot.cardsInPlay)
        );
        if(!selectCards(bot, cards)) {
            return this.fail();
        }
    }
}

class HealWardCaptureOurCards extends BotRule {
    match(bot) {
        if(promptHasAction(bot.promptState, ['ward', 'heal'])){
            return true;
        }
        return (bot.promptState.selectableCards.length > 0 && promptText(bot).search(/ward|heal|capture/i) > -1);
    }
    apply(bot) {
        if(selectCards(bot, _.shuffle(bot.cardsInPlay))){
            return;
        }
        return this.fail();
    }
}

class DamageDestroyOpponentCards extends BotRule {
    match(bot) {
        if(promptHasAction(bot.promptState, ['damage', 'destroy'])){
            return true;
        }
        
        return (bot.promptState.selectableCards.length > 0 && promptText(bot).search(/damage|destroy/i) > -1);
    }
    apply(bot) {
        if(selectCards(bot, _.shuffle(bot.opponent.cardsInPlay))){
            return;
        }
        return this.fail();
    }
}

class SelectRandomCards extends BotRule {
    apply(bot) {
        if(selectCards(bot, _.shuffle(bot.promptState.selectableCards))) {
            return;
        }
        return this.fail();
    }
}

class PlayPhaseEnd extends BotRule {
    apply(bot) {
        bot.interactor.clickPrompt('End Turn');
        // Maybe check if we need to press yes first
        bot.interactor.clickPrompt('Yes');
    }
}

class BotPlayer extends Player {
    constructor(strategy='random', ...args) {
        super(...args);
        if(strategy === 'random') {
            this.houseChoiceRules = [new SelectRandomCards, new SelectRandomButton];
            this.playPhaseRules = [new RandomPhase, new PlayPhaseEnd];
            this.otherRules = [new SelectRandomCards, new SelectRandomButton];
        } else if (strategy === 'standard') {
            this.houseChoiceRules = [new HandPlusBoard, new SelectRandomButton];
            this.playPhaseRules = [
                new PlayPhasePlay,
                new PlayPhaseDiscardAllFromHand,
                new PlayPhaseUse,
                new RandomPhase,
                new PlayPhaseEnd
            ];
            this.otherRules = [
                new AlwaysExaltMay, new AlwaysExaltSelectCards,
                new HealWardCaptureOurCards,
                new DamageDestroyOpponentCards,
                new SelectRandomCards,
                new SelectRandomButton
            ];
        } else {
            throw new Error('Bot not created with strategy');
        }
    }

    drawCardsToHand(numCards) {
        super.drawCardsToHand(numCards);

        /* For testing specific cards */

        for (let card of this.deck) {
            if (card.name === 'Defense Initiative') {
                this.moveCard(card, 'hand');
            }
        }
    }

    speak(...args) {
        this.game.gameChat.addMessage('{0}: {1}', this, args);
        console.log(this.game.gameChat.messages[this.game.gameChat.messages.length - 1].message);
        logger.debug(
            util.inspect(
                this.game.gameChat.messages[this.game.gameChat.messages.length - 1].message
            )
        );
    }

    speakDebug(...objects) {
        let s = '';
        let inspected = objects.map(function (o) {
            return util.inspect(
                o,
                new Object({
                    maxArrayLength: 3,
                    sorted: true,
                    depth: 1
                })
            );
        });
        s = inspected.join(', ');
        //logger.debug(s);
        //this.speak(s);
    }

    promptDebug() {
        let d = {
            phase: this.game.pipeline.getCurrentStep().name,
            activePlayer: this.game.activePlayer == this,

        }
    }

    tick(game) {
        return(this.botRespond());
    }

    /* This tick function is incomplete until the gamecopy is working correctly */
    tickForBestScoreAfterSeveralMoves(game) {
        let gameCopy = new GameCopy();
        let bestScore = 0;
        let bestState = null;
        let startState = gameCopy.saveGame(game);
        console.log('start at score:' + new GameStateRecord(game)[this.name].scoreDelta);
        console.log('bot tick');
        for (let attempt=0; attempt<=0; attempt++) {
            console.log('bot think attempt ' + attempt);
            gameCopy.restoreGame(startState, game);
            let changes = false;
            for (let i = 0; i < 6; i++) {
                if (this.botRespond()) {
                    changes = true;
                }
            }
            let record = new GameStateRecord(game);
            if(changes && (!bestState || record[this.name].scoreDelta > bestScore)) {
                bestScore = record[this.name].scoreDelta;
                bestState = gameCopy.saveGame(game);
                console.log('updated score for attempt ' + attempt + ':' + bestScore);
            }
            else if (changes) {
                console.log('ignoring score for attempt ' + attempt + ':' + record[this.name].scoreDelta);
            } else {
                console.log('nochange for attempt ' + attempt);
            }
        }
        if(bestState) {
            console.log(bestState.activePlayer);
            gameCopy.restoreGame(bestState, game);
            console.log('found best state');
            console.log(game.activePlayer? game.activePlayer.name : 'no active player');
            return true;
        } else {
            console.log('no best state found');
            console.log(game.activePlayer? game.activePlayer.name : 'no active player');
            return false;
        }
    }

    get interactor() {
        return new PlayerInteractionWrapper(this.game, this);
    }

    botRespond() {
        this.speakDebug('  ---   THINKING ---  ');
        this.speakDebug(this.game.pipeline.getCurrentStep());
        if(this.promptState && 
            (
                lo.includes(promptText(this),'Waiting for opponent')
            )
        ) {
            return false;
        }
        if (this.promptState) {
            this.speak(new ActionRecordItem(this).debugString());
            return this.handlePrompt();
        }
        return false;
    }

    handlePrompt() {
        let interactor = this.interactor;
        this.speakDebug(this.currentPrompt());
        if (!interactor.canAct) {
            return false;
        }

        if (interactor.hasPrompt('Start Game')) {
            interactor.clickPrompt('Start the Game');
            return true;
        } else if (interactor.hasPrompt('Mulligan')) {
            if (this.botEvaluateMulligan(this.hand)) {
                interactor.clickPrompt('Mulligan');
                this.speak('Going to mulligan');
            } else {
                interactor.clickPrompt('Keep Hand');
                this.speak("I'll keep this");
            }
            return true;
        }
        this.speakDebug(this.game.effectEngine.effects);
        this.speakDebug(interactor.currentPrompt());
        this.speakDebug(this.promptState);
        this.speakDebug(this.promptState.base);
        //this.speakDebug(this.game.pipeline.getCurrentStep());
        //for(let pipeline of this.game.pipeline.getCurrentStep().pipeline.pipeline) {
        //    this.speakDebug(pipeline);
        //}
        if (interactor.hasPrompt('House Choice')) {
            this.speak('Choosing a house:');
            return this.evaluateRules(this.houseChoiceRules);
        } else if (interactor.hasPrompt('Play phase')) {
            this.speak('Playing the main phase');
            try {
                this.evaluateRules(this.playPhaseRules);
            } catch (err) {
                return true;
            }
        } else if (interactor.hasPrompt('End Turn')) {
            this.speak('Ending the turn');
            interactor.clickPrompt('Yes');
        } else if (promptText(this).search('enable manual mode') > -1) {
            interactor.clickPrompt('Yes');
        } else {
            this.evaluateRules(this.otherRules);
        }
        return true;
    }

    botEvaluateMulligan(hand) {
        if (hand.length >= 7) {
            this.speak('I always mulligan with 7 or more cards');
            return true;
        }
        this.speak('I never mulligan with 6 cards');
        return false;
    }

    evaluateRules(rules) {
        for(const rule of rules) {
            if(rule.match(this)) {
                try {
                    let result = rule.applyRule(this);
                    if(!rule.failed) {
                        this.speak('ran rule ' + rule.constructor.name);
                        return result;
                    } else {
                        this.speak('failed rule ' + rule.constructor.name);
                    }
                } catch(err) {
                    this.speak('Error processing rule '+rule.constructor.name+': '+err);
                    continue;
                }
            } else {
                this.speak('passing up rule ' + rule.constructor.name);
            }
        }
    }

    botUpgradeTarget(card) {
        let targets = [];
        let playOnThis = true;
        let playOnOpponent = false;
        if (playOnThis) {
            this.speak('  this upgrade would be good for my creatures');
            targets = targets.concat(this.cardsInPlay);
        }
        if (playOnOpponent) {
            this.speak('  this upgrade would be good on an opponent');
            targets = targets.concat(this.opponent.cardsInPlay);
        }
        if (targets.length > 0) {
            return _.sample(targets, 1)[0];
        }
        this.speak('  but no good targets were found');
    }

    botShouldPlay(card) {
        return true;
    }
}

module.exports = BotPlayer;
