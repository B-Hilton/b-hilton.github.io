---
layout: page
title: BYU Physics
description: life as a vacuum technician
img: assets/img/past_projects/pump_repair.jpeg
importance: 1
category: work
related_publications: true
---

Every project has a beautiful feature showcase page.
It's easy to include images in a flexible 3-column grid format.
Make your photos 1/3, 2/3, or full width.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/z_pinch_frames.gif" title="flourescence" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/z_plasma.png" title="plasma" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/z_pinch_principle.gif" title="principle" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    This was neat to see. A large capacitor at 30kV discharges through a thin tungsten wire, vaporizing it and causing a plasma z-pinch. The frames of slow motion footage show green flourescence from the plastic around the tungsten wire. The middle picture is of the plasma pinch, the last is a reminder of how we can use this z-pinch to compress plasmas containing hydrogen to cause nuclear fusion reactions.
</div>
<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/5.jpg" title="example image" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    This image can also have a caption. It's like magic.
</div>

You can also put regular text between your rows of images, even citations {% cite einstein1950meaning %}.
Say you wanted to write a bit about your project before you posted the rest of the images.
You describe how you toiled, sweated, _bled_ for your project, and then... you reveal its glory in the next row of images.

<div class="row justify-content-sm-center">
    <div class="col-sm-4 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/past_projects/paschenPlasma" title="plasma device testing" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-8 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/past_projects/pump_repair.jpeg" title="rotary vane problems" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    We built devices to teach about plasma and the Paschen curve. A common sight on the job.
</div>

<div class="row justify-content-sm-center">
    <div class="col-sm-8 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/past_projects/turbo_test.jpeg" title="TURBO" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-4 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/past_projects/turbo_test_sound.png" title="FFT" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Testing a turbo pump system. I found it interesting to see the resonances on an audio FFT during spin-down.
</div>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/bug.jpeg" title="a hardware bug" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/large_dirty_chamber.jpeg" title="defunct spectral analysis" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/tube_furnace.jpeg" title="Into the Dragon's Lair" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Damage due to a literal hardware bug (see if you can spot it). Taking apart a large spectral analysis setup. Norbert the tube furnace.
</div>



{% raw %}

```html
<div class="row justify-content-sm-center">
  <div class="col-sm-8 mt-3 mt-md-0">
    {% include figure.liquid path="assets/img/6.jpg" title="example image" class="img-fluid rounded z-depth-1" %}
  </div>
  <div class="col-sm-4 mt-3 mt-md-0">
    {% include figure.liquid path="assets/img/11.jpg" title="example image" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
```

{% endraw %}
