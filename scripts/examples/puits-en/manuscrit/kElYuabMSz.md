The lake rises.

Not a wave: a shape. The water of the lake climbs and stands upright, as tall as the barn, with no fixed outline, and inside it the little lights you took for stars turn slowly. Up close, you see what they are: faces. Tiny, pale, asleep. Étienne. Jeanne. Marcel. And others, many others, older than the farm.

When the thing speaks, it speaks with their voices. All at once, then one, then another, the way you look for the right tool on a wall.

“The old woman is dead,” it says in Jeanne’s voice. “She used to sit on me. Forty years.” In Marcel’s voice: “It was a long time.” And then, in Paul’s voice, exactly Paul’s voice, which is the worst of all: “Now it’s your turn. The debt is due. It needs a child of the house.”

Paul presses against your leg. Or against nothing, if he hasn’t recognised you.

The air turns dry, so dry your lips split. You understand that it is already drinking you, a little, to get the taste.

```choix
* { name_given } [Hear it say your name, in your own voice] -> the_stolen_voice
* { not name_given } [Offer to take Paul’s place] -> the_exchange
* { not name_given and ourdas and recognised and flame > 0 } [Raise the lantern and say its name] -> the_morning
* { not name_given and ourdas and not recognised } [Say its name] -> the_name
* { not name_given and ourdas and recognised and flame < 1 } [Say its name in the dark] -> the_name
* [Grab Paul and run for the ladder] -> the_black_water
```
