@horsepower/template is a template tool originally built for the horsepower http server, and uses custom html tags for different features such as `loops`, `if/elif/else`, etc.

## Horsepower Http Server Usage

This is the basic usage. All examples use the horsepower http server.

### Basic Usage

**controller.js**

```js
module.exports.main = async function(client) {
  return client.response.render('welcome.mix', {
    name: 'Billy Bob Joe'
  })
}
```

**welcome.mix**

```html
<html>
  <head>
    <title>Welcome</title>
  </head>
  <body>
  <h1>Welcome, {{$name}}</h1>
  </body>
</html>
```

### Variables

Variables are used to work with data that have been assigned to the template.

Existing variables are used within double braces which are opened with `{{` and closed with `}}`
If the variable already exists, use a `$` to prefix it. Variables must then start with a letter.

**Valid examples:**

* `{{$red}}`
* `{{$red.white.blue}}`

**Invalid examples:**

* `{{$123}}`
* `{{$.red}}`

New variables can be created within cases that create new scopes, such as `each`, `if`, `for`. These variables are not created within braces and don't start with a `$`. See examples in the related block type below.

### Block/extends

A block is a way to group a block of data this data can then be used in other places. The block file must also use `extends` to extend a parent file. The parent file then also has a matching block statement.

**root.mix**

```html
<body>
  <block name="header"></block>
  <block name="content"></block>
</body>
```

**example.mix**

```html
<extends file="root" />

<block name="header">
  <nav>
    <!-- Custom navigation for the page -->
  </nav>
</block>

<block name="content">
  <main>
    <!-- Custom content for the page -->
  </main>
</block>
```

When rendering the file, you would render **example.mix** this will then load **root.mix** and build the output.

```js
module.exports.main = async function(client) {
  return client.response.render('example.mix')
}
```

Generating the final output:

```html
<body>
  <nav>
    <!-- Custom navigation for the page -->
  </nav>
  <main>
    <!-- Custom content for the page -->
  </main>
</body>
```

### Each

An each is used to to loop over an array of items such as strings, numbers, objects, etc.

```js
module.exports.main = async function(client) {
  return client.response.render('example.mix', {
    todo: ['Eat', 'Sleep', 'Repeat'],
    months: [
      { name: 'January', 'days': 31 },
      { name: 'February', 'days': 28 },
      { name: 'March', 'days': 30 },
      { name: 'April', 'days': 31 }
    ]
  })
}
```

```html
<ul>
  <each :="item in {{$todo}}">
    <li>{{$item}}</li>
  </each>
</ul>
<ul>
  <each :="month in {{$months}}">
    <li>{{$month.name}} has {{$month.days}} days</li>
  </each>
</ul>
```

Each also comes with an else statement which will execute if the array is empty.

```js
module.exports.main = async function(client) {
  return client.response.render('example.mix', {
    empty: []
  })
}
```
```html
<ul>
  <each :="item in {{$empty}}">
    <li>{{$item}}</li>
  </each>
  <else>
    <li>No items found!</li>
  </else>
</ul>
```

### For

A **for loop** is used to loop over a range of numbers and has two different formats.

* `i from 0 through 100` (`thru` is an alias for `through`)
* `i from 0 to 100`

To loop in reverse, use a bigger starting number than ending number. Numbers can also come from variables `i from {{$start}} to {{$end}}` and also may be mixed `i from 0 thru {{$end}}`.

When using **through** this will start at the first number and go to the last number inclusively.

```html
<ul>
  <for :="i from 1 thru 5">
    <li>Index: {{$i}}</li>
  </for>
</ul>
```

The generated html will result in the following:

```html
<ul>
  <li>Index: 1</li>
  <li>Index: 2</li>
  <li>Index: 3</li>
  <li>Index: 4</li>
  <li>Index: 5</li>
</ul>
```

When using **to** this will start at the first number and go to the last number exclusively.

```html
<ul>
  <for :="i from 1 to 5">
    <li>Index: {{$i}}</li>
  </for>
</ul>
```

The generated html will result in the following:

```html
<ul>
  <li>Index: 1</li>
  <li>Index: 2</li>
  <li>Index: 3</li>
  <li>Index: 4</li>
</ul>
```

### If/elif/else

If statements can be used to test if a statement is valid and if it is that block can be ran.

```html
<if :="{{$item}} == 0">
  <p>The item is equal to zero</p>
</if>
<elif :="{{$item}} == 1">
  <p>The item is equal to one</p>
</elif>
<else>
  <p>The item does not match anything</p>
</else>
```