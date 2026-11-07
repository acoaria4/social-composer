# AURA horoscope artwork

`background-wednesday.png` is the approved clean sage celestial plate. The other six daily backgrounds and `background-none.png` were produced using the built-in image generation tool, using that plate as the edit reference. They are local assets, not runtime image-generation requests.

Generation direction: retain the sun at upper left, moon at upper right, gold orb/crescent at top center, edge flowers, and lower mountain/river scene. Change only the cloud/sky/landscape atmosphere to warm honey gold (Sunday), cool moon pearl (Monday), soft terracotta (Tuesday), soft saffron (Thursday), dusty rose (Friday), lavender (Saturday), or neutral ivory. Keep the center pale and quiet with no cards, zodiac emblems, text, or new decoration.

The Wednesday plate was generated from `ivory-emblems.png` by removing the baked-in cards and emblems and giving the clouds a subtle sage atmosphere. The original asset remains the source for gold emblem crops. Cards and all text are drawn by the shared renderer, so AI-generated typography is never used.

`zodiac-cover-ring.png` is the transparent antique-gold zodiac ornament selected for the daily cover design. It was generated with the built-in image-generation tool using the supplied lavender cover as a style reference: twelve upright zodiac figures in Aries-to-Pisces order, thin concentric rings and radial dividers, an empty transparent center, and no lettering or numerals. The cover renderer reuses the selected daily background and draws the AURA wordmark, localized title, date, month/year, and weekday separately with local fonts. The ornament is a static local asset; creating a cover makes no image-generation request.
