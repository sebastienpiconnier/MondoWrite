The kitchen door isn’t locked. It never has been.

You reach for the light switch out of habit. Nothing. The notary had the meter cut off. If you have the lantern, its light slides over the checked oilcloth; if not, it is the moon, through the window, that draws a blue rectangle on the tiles.

Everything is tidy. Too tidy. The dishes are drying on the rack, two bowls, two spoons. The clock above the stove has stopped at twelve minutes past three. The neighbours told you Odile died in her armchair, here, in the middle of the night. They didn’t say what time.

On the table there is a glass of water. Full to the brim. At the bottom, a thin layer of grey sand, and when you come closer, the surface shivers. There is no wind, though. No vibration. The water shivers like skin.

In the corner stands Odile’s desk, a walnut bureau whose middle drawer was always locked. As a child you tried to open it with a hairpin. She walked in at that very moment and, for the only time in your life, she slapped you.

Above the desk, a framed photo: Paul and you, sitting on the rim of the well, the summer he turned seven. You are laughing. Behind you, the mouth of the well is a perfectly black circle.

```choix
* { key } [Open the drawer with the iron key] -> odile_s_letter
  ~ notebook = true
  ~ ourdas = true
* { not lantern } [Go back out for the lantern] -> taking_the_lantern
  ~ lantern = true
  ~ flame = 3
* { lantern } [Go to the well] -> the_well
* { not lantern } [Go to the well in the dark] -> groping_in_the_dark
* [Go up to bed and forget all this until tomorrow] -> the_house
```
