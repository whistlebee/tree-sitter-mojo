# tree-sitter-mojo

grug write parser for mojo language. mojo only love vscode. vscode slow. grug like fast. grug make tree-sitter parser so grug can use in zed and neovim.

shiny colors make code easy read. tree-sitter make jumping between functions easy. fast. not break when grug type wrong.

## status

works well enough

## how grammar made

grug lazy. complexity demon bad. python parser already very good. mojo look like python most of time. so grug start with `tree-sitter-python` and add mojo rules on top. this save much time.

sometimes syntax is confusing. square brackets `[]` can be list, or can be compile time parameter. how parser know? parser use external C scanner. C code look ahead and decide. C code hard to write but keep grammar file simple and fast. 

## help grug

grug welcome help. if find bug, open issue. MIT license. code is yours.
