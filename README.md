# The Linear Algebra Calculator 2.0

To Mrs. B, who inspired LAC 1.0 and was startled by a sparrow that darted in through the window.

An interactive linear algebra workspace for classrooms. It combines matrix calculation with visual experiments that show how matrices represents linear transformations in the plane. 

## Some backstory

The project began as a Tkinter calculator (see 'README_linear_calc.md' and 'linear_calc.py') in 2021, made by the author while he was in high school. It was designed as a symbolic calculation tool that can do basic matrix algebra, and can visualize linear transformations. I made it for my maths teacher Mrs. B, who was about to teach linear algebra for a new syllabus. 

Version 2.0 completely revamps that prototype into a web app with new calculation engines, interactive teaching labs, and modern UI, built entirely with Codex on GPT-5.6 Sol Ultra.

## How it's built

I gave Codex the original LAC script and a goal: transform this six-year-old classroom experiment into a polished, modern classroom application.

Codex inspected the existing program, proposed a modernisation plan, and began implementing it. The first run already produced a (really good!) working product. From there, I directed further iterations: refining UI, adding new maths functionality, etc, most of them minor edits. The most remarkable thing for me was that Codex opened an internal browser, and tested the web app on its own, saving me so much effort. 

Apart from the original script [linear_calc.py](linear_calc.py), the new application was built entirely by GPT-5.6 Sol Ultra, through around 10 iterations.


## Highlights

- Create and save named matrices from 1×1 to 6×6 in the browser.
- Calculate addition, multiplication, RREF, inverses, and real diagonalisation.
- Explain why an operation is unavailable and suggest a useful correction.
- Select the primary calculation matrix directly from the matrix shelf.
- Animate 2×2 transformations from the identity to the target matrix, with Slow and Fast playback modes.
- Edit transformed basis vectors by dragging, keyboard nudging, or exact coordinates.
- Compare L₂ least-squares projection with L₁ least-absolute-error fitting, including non-unique L₁ solutions; drag either the spanning direction or target vector to experiment.
- Explore a 2×2 singular value decomposition by moving a Cartesian grid and its canonical basis through Vᵀ, Σ, and U toward the final transformation.


## A quick tour

1. In **Calculate**, select a matrix from the shelf and try RREF, addition, multiplication, and inverse. Paste `4, 1; 2, 3` into a matrix to see an exact diagonalisation with eigenvalues 5 and 2.
2. In **Transform**, choose a matrix, press **Play transformation**, and toggle **Eigenvectors** to watch unit vectors become λ₁v₁ and λ₂v₂. Turn on **Edit basis** to move either basis vector directly.
3. In **Projection**, drag both `a` and `b` to compare the L₂ and L₁ nearest points and residuals.
4. In **SVD**, press **Play factors** to watch the canonical grid move through Vᵀ, Σ, and U.

All calculations and saved workspace data remain in the browser.

Please share around schools and teachers and let me know how it goes in class!


## Contributing and security

Contributions and teaching-focused feedback are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and use GitHub's private vulnerability reporting for security issues as described in [SECURITY.md](SECURITY.md).

## Licence

Released under the [MIT License](LICENSE).
