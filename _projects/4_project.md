---
layout: page
title: HV research
description: for surface wakefield proton acceleration
img: /assets/img/past_projects/cover.png
importance: 3
category: fun
---


<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/cover.png" title="the vacuum system" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/old_setup.jpg" title="the old setup" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    The old vacuum setup circa 2020. I had a lot to learn. It was a good time.
</div>
<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/sensor_On.png" title="the simplified experiment" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    The simplified experiment.
</div>

You can also put regular text between your rows of images.
Say you wanted to write a little bit about your project before you posted the rest of the images.
You describe how you toiled, sweated, _bled_ for your project, and then... you reveal its glory in the next row of images.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/testing.png" title="testing leds" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/tiny_uv_led.jpg" title="UVB-UVC LED" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Getting the UV light.
</div>

So yeah documentation is a pain.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/smaller_sim_anim.gif" title="simulating the HV supply" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/early_design.png" title="early HV design" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/past_projects/multiplier.png" title="larger_multiplier" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Sumilating, building, and upgrading the voltage multiplier.
</div>



The code is simple.
Just wrap your images with `<div class="col-sm">` and place them inside `<div class="row">` (read more about the <a href="https://getbootstrap.com/docs/4.4/layout/grid/">Bootstrap Grid</a> system).
To make images responsive, add `img-fluid` class to each; for rounded corners and shadows use `rounded` and `z-depth-1` classes.
Here's the code for the last row of images above:

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
