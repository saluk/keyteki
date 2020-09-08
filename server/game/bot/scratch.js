const _ = require('underscore');
const { v4: uuidv4 } = require('uuid');

class DummyGame {
    constructor(value) {
        this.value = value;
        this.target = 57;
        this.uuid = uuidv4();
    }
    DEEP_CLONE() {
        return new DummyGame(_.clone(this.value));
    }
    APPLY_ACTIONS(actions) {
        for (const action of actions) {
            if (action == 'add1') {
                this.value += 1;
            } else if (action == 'sub1') {
                this.value -= 1;
            } else if (action == 'add12') {
                this.value += 12;
            }
        }
    }
    IS_STEP3() {
        return true;
    }
    IS_OVER() {
        return this.GET_SCORE() == 0;
    }
    GET_ACTIONS() {
        return [_.shuffle(['add1', 'sub1', 'add12'])[0]];
    }
    GET_SCORE() {
        return Math.abs(this.value - this.target);
    }

    output() {
        console.log('  ' + this.uuid + ' game_value: ' + this.value);
    }
}

let d1 = new DummyGame(12);
let d2 = d1.DEEP_CLONE();

class Step {
    constructor(game, actions = []) {
        this.game = game.DEEP_CLONE();
        this.game.APPLY_ACTIONS(actions);
        this.action_scores = [];
        this.score_f = Math.min;
    }

    getOptions() {
        if (this.game.IS_STEP3()) {
            return this.game.GET_ACTIONS();
        } else if (this.game.IS_PROMPT()) {
            return this.game.GET_PROMPT_OPTIONS();
        }
        return [];
    }

    addScore(action_list, score) {
        for (const action_score of this.action_scores) {
            if (_.isEqual(action_list, action_score.action_list)) {
                return;
            }
        }
        this.action_scores.push({
            score: score,
            action_list: action_list
        })
    }

    evaluate() {
        this.game.output();
        console.log(this.action_scores);
        let best_score = null;
        let best_actions = [];
        for (let action_score of this.action_scores) {
            if (best_score == null || action_score.score == this.score_f(action_score.score, best_score)) {
                best_actions = action_score.action_list;
                best_score = action_score.score;
            }
        }
        if (best_actions.length == 0) {
            console.log('evaluate last leaf:' + this.game.GET_SCORE());
            return {
                score: this.game.GET_SCORE(),
                actions: []
            };
        }
        console.log('evaluate step with actions: ');
        console.log(best_actions);
        return {
            score: best_score,
            actions: best_actions
        };
    }
}

class Runner {
    constructor() {
        this.tree = [];
        this.num_orderings = 20;
        this.tree_depth = 5;
    }

    takeStep(step, level = 0) {
        this.tree.push(step);
        if (this.tree.length > this.tree_depth || step.game.IS_OVER()) {
            console.log('returning score');
            this.tree.pop();
            return step.evaluate();
        }
        console.log(' - step state - ' + level);
        step.game.output();
        for (let i = 0; i < this.num_orderings; i++) {
            let actions = step.getOptions();
            console.log(' available actions: ' + actions);
            let new_order = _.shuffle(actions);
            new_order = new_order.slice(0, _.random(1, new_order.length));
            console.log('*trying new order:' + new_order);
            let new_step = new Step(step.game, new_order);
            let action_score = this.takeStep(new_step, level + 1);
            step.addScore(new_order, action_score.score);
        }
        this.tree.pop();
        return step.evaluate();
    }

    process(game) {
        console.log('start processing\n\n');
        let result = this.takeStep(new Step(game, []));
        console.log('game current state');
        game.output();
        console.log('applying action ' + result.actions);
        game.APPLY_ACTIONS(result.actions);
        game.output();
        console.log('\n\nend state');
        console.log(game.value + ',' + game.GET_SCORE());
    }
}

let runner = new Runner();
let start_game = new DummyGame(12);
while (1) {
    runner.process(start_game);
    if (start_game.IS_OVER()) {
        break;
    }
}
