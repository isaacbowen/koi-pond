# koi pond

I wanted to know if the following behavioral logic chunks, combined, would result in natural flocking behavior:

1. you have a limited field of vision, in the direction that you're facing.
2. look for your nearest neighbor. then, look for _their_ closest neighbor (staying within your field of vision, and recalling that you can't see _through_ anybody). steer directly into the gap between those neighbors.
3. prefer to keep _some_ breathing room between y'all.
4. allow yourself to be gently guided by some higher-level current. in this case, there's a gentle circular current through the whole pool.

turns out chatgpt is REALLY GOOD at translating this kind of thing into code. so, so, so much fun.

there's more to explore here. I think it'd work to have clusters of nodes develop _their own_ behavioral intelligence, which would then serve as that step-4-gentle-guidance factor. this ends up becoming recursive (as all life is). I think I may yet explore that direction (as if I wasn't ALWAYS exploring organic recursion, lol), but for the moment, the gentle circular current will do as a simplified proxy. :)

love y'all
