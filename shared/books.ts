export type BookCategory =
  | "All"
  | "Fiction"
  | "Nonfiction"
  | "Poetry"
  | "Food & drink";

export type Book = {
  id: string;
  title: string;
  author: string;
  category: Exclude<BookCategory, "All">;
  price: number;
  rating: number;
  reviews: number;
  summary: string;
  description: string;
  pages: number;
  format: string;
  published: string;
  coverColor: string;
  coverAccent: string;
  coverLabel: string;
  tags: string[];
  featured?: boolean;
  badge?: string;
};

export const categories: BookCategory[] = [
  "All",
  "Fiction",
  "Nonfiction",
  "Poetry",
  "Food & drink",
];
export const FREE_SHIPPING_THRESHOLD = 1500;
export const SHIPPING_PRICE = 99;

export function getShippingPrice(subtotal: number) {
  return subtotal > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_PRICE;
}

export const books: Book[] = [
  {
    id: "the-map-of-small-things",
    title: "The Map of Small Things",
    author: "Leila Aboulela",
    category: "Fiction",
    price: 1850,
    rating: 4.8,
    reviews: 214,
    summary:
      "A luminous novel about a cartographer learning to find her way home.",
    description:
      "When a quiet cartographer is sent to redraw the coastline of a city she left behind, she begins to map the overlooked details of a life: the bakery window, a stranger's blue umbrella, the sound of a particular train. Tender and quietly transporting.",
    pages: 336,
    format: "Hardback",
    published: "2024",
    coverColor: "#dfcdb7",
    coverAccent: "#496b56",
    coverLabel: "A novel",
    tags: ["belonging", "place", "quietly moving"],
    badge: "Staff pick",
  },
  {
    id: "on-looking",
    title: "On Looking",
    author: "Alexandra Horowitz",
    category: "Nonfiction",
    price: 1600,
    rating: 4.7,
    reviews: 178,
    summary: "A field guide to seeing the familiar world with fresh eyes.",
    description:
      "Alexandra Horowitz invites us outside and introduces us to the many ways a single city block can be seen. Part science, part walking companion, this is a generous book about attention and the overlooked magic of ordinary life.",
    pages: 304,
    format: "Paperback",
    published: "2023",
    coverColor: "#d5e4dd",
    coverAccent: "#2e5c58",
    coverLabel: "Essays",
    tags: ["attention", "walking", "nature"],
    featured: true,
    badge: "New arrival",
  },
  {
    id: "soft-edges",
    title: "Soft Edges",
    author: "Mina Kwon",
    category: "Poetry",
    price: 1475,
    rating: 4.9,
    reviews: 96,
    summary: "Small, precise poems for the days that need a little more room.",
    description:
      "Mina Kwon's debut collection makes a home out of the in-between. These poems move with the hush of early mornings, finding tenderness in bus rides, winter light, and the things we almost say.",
    pages: 112,
    format: "Paperback",
    published: "2024",
    coverColor: "#e6bcb4",
    coverAccent: "#8c4e50",
    coverLabel: "Poems",
    tags: ["tenderness", "everyday", "debut"],
    featured: true,
  },
  {
    id: "salt-and-sun",
    title: "Salt & Sun",
    author: "Sofia Armas",
    category: "Food & drink",
    price: 2800,
    rating: 4.6,
    reviews: 132,
    summary: "Bright Mediterranean cooking for long lunches and late light.",
    description:
      "A sunlit collection of 90 recipes built around good olive oil, seasonal produce, and the pleasure of feeding people. Every chapter is designed for lingering: from pantry pastas to orange-scented cakes.",
    pages: 240,
    format: "Hardback",
    published: "2024",
    coverColor: "#f0d16f",
    coverAccent: "#bd5b36",
    coverLabel: "Recipes",
    tags: ["seasonal", "gathering", "mediterranean"],
    featured: true,
    badge: "For the table",
  },
  {
    id: "the-night-garden",
    title: "The Night Garden",
    author: "Hannah Richell",
    category: "Fiction",
    price: 1725,
    rating: 4.5,
    reviews: 88,
    summary: "A layered family story rooted in one wild, beautiful garden.",
    description:
      "Three generations, one hidden garden, and the truths that bloom after dark. Hannah Richell writes with an eye for the natural world and a deep sympathy for the ways families carry their histories.",
    pages: 368,
    format: "Paperback",
    published: "2022",
    coverColor: "#415a52",
    coverAccent: "#d6b75a",
    coverLabel: "A novel",
    tags: ["family", "secrets", "nature"],
  },
  {
    id: "how-to-be-a-person",
    title: "How to Be a Person",
    author: "Molly Wizenberg",
    category: "Nonfiction",
    price: 1950,
    rating: 4.4,
    reviews: 71,
    summary: "Notes on friendship, work, and becoming yourself in public.",
    description:
      "Warm, funny, and deeply practical, this is a book about the small negotiations that make up a life: how to make a friend, leave a job, say sorry, and stay close to the people who know you best.",
    pages: 272,
    format: "Hardback",
    published: "2021",
    coverColor: "#cbd0e0",
    coverAccent: "#594b70",
    coverLabel: "Notes",
    tags: ["friendship", "life", "essays"],
  },
  {
    id: "a-little-weather",
    title: "A Little Weather",
    author: "Tomoko Shibasaki",
    category: "Fiction",
    price: 1525,
    rating: 4.6,
    reviews: 54,
    summary: "A quietly funny story about change, chance, and city life.",
    description:
      "In a city where the forecast never seems to settle, two neighbors begin to notice one another. A Little Weather is a delicate, observant novel about coincidence, routine, and the gentle courage of paying attention.",
    pages: 208,
    format: "Paperback",
    published: "2020",
    coverColor: "#b9d3e1",
    coverAccent: "#355e78",
    coverLabel: "Translated",
    tags: ["city life", "translated", "observant"],
  },
  {
    id: "the-good-supper",
    title: "The Good Supper",
    author: "Mara Phelps",
    category: "Food & drink",
    price: 2400,
    rating: 4.8,
    reviews: 110,
    summary: "Simple menus for making an ordinary evening feel considered.",
    description:
      "From the first drink to the last spoonful, The Good Supper is a thoughtful guide to hosting without the fuss. Buildable menus, generous notes, and recipes that leave you at the table with your guests.",
    pages: 208,
    format: "Hardback",
    published: "2023",
    coverColor: "#e3c2a9",
    coverAccent: "#694d3a",
    coverLabel: "At home",
    tags: ["hosting", "menus", "comfort"],
  },
  {
    id: "project-hail-mary",
    title: "Project Hail Mary",
    author: "Andy Weir",
    category: "Fiction",
    price: 799,
    rating: 4.8,
    reviews: 192,
    summary:
      "A lone astronaut wakes with a mission that could save life on Earth.",
    description:
      "An inventive space adventure follows a scientist piecing together his past and an impossible mission, one clever discovery at a time.",
    pages: 496,
    format: "Paperback",
    published: "2021",
    coverColor: "#d8d8c6",
    coverAccent: "#344c46",
    coverLabel: "Science fiction",
    tags: ["space", "science", "adventure"],
    featured: true,
    badge: "Bestseller",
  },
  {
    id: "the-creative-act",
    title: "The Creative Act",
    author: "Rick Rubin",
    category: "Nonfiction",
    price: 899,
    rating: 4.7,
    reviews: 154,
    summary: "A reflective guide to noticing ideas and making room for them.",
    description:
      "Drawing on a lifetime of creative work, Rick Rubin offers short reflections on curiosity, attention, and the many forms a creative practice can take.",
    pages: 432,
    format: "Hardback",
    published: "2023",
    coverColor: "#eee4d0",
    coverAccent: "#673c34",
    coverLabel: "A way of being",
    tags: ["creativity", "practice", "ideas"],
    badge: "Trending",
  },
  {
    id: "atomic-habits",
    title: "Atomic Habits",
    author: "James Clear",
    category: "Nonfiction",
    price: 649,
    rating: 4.7,
    reviews: 238,
    summary:
      "Practical ideas for building useful habits through small changes.",
    description:
      "A practical look at how routines take shape and how modest changes to daily systems can support long-term goals.",
    pages: 320,
    format: "Paperback",
    published: "2018",
    coverColor: "#d9e3dc",
    coverAccent: "#273d36",
    coverLabel: "Self-improvement",
    tags: ["habits", "growth", "routine"],
  },
  {
    id: "milk-and-honey",
    title: "Milk and Honey",
    author: "Rupi Kaur",
    category: "Poetry",
    price: 449,
    rating: 4.4,
    reviews: 178,
    summary:
      "A collection of poems about tenderness, loss, and finding a voice.",
    description:
      "This illustrated poetry collection moves through difficult and hopeful moments with direct language and a focus on healing.",
    pages: 208,
    format: "Paperback",
    published: "2014",
    coverColor: "#eee1d4",
    coverAccent: "#68493d",
    coverLabel: "Poetry",
    tags: ["poetry", "healing", "love"],
    badge: "Reader favourite",
  },
  {
    id: "the-house-in-the-cerulean-sea",
    title: "The House in the Cerulean Sea",
    author: "TJ Klune",
    category: "Fiction",
    price: 699,
    rating: 4.8,
    reviews: 203,
    summary: "A by-the-book caseworker finds an unexpected family by the sea.",
    description:
      "A careful caseworker is sent to assess an unusual home and discovers that its residents may change his ideas about duty, belonging, and family.",
    pages: 400,
    format: "Paperback",
    published: "2020",
    coverColor: "#c6e0e4",
    coverAccent: "#31556c",
    coverLabel: "A novel",
    tags: ["found family", "fantasy", "belonging"],
  },
  {
    id: "the-midnight-library",
    title: "The Midnight Library",
    author: "Matt Haig",
    category: "Fiction",
    price: 599,
    rating: 4.5,
    reviews: 266,
    summary:
      "A library between life and death offers a chance to explore other paths.",
    description:
      "Between life and death lies a library of possible lives. One visitor explores its shelves while reconsidering what makes a life meaningful.",
    pages: 304,
    format: "Paperback",
    published: "2020",
    coverColor: "#d7d4e4",
    coverAccent: "#51496e",
    coverLabel: "A novel",
    tags: ["possibility", "life", "fantasy"],
    badge: "Bestseller",
  },
  {
    id: "the-wok",
    title: "The Wok",
    author: "J. Kenji López-Alt",
    category: "Food & drink",
    price: 1299,
    rating: 4.9,
    reviews: 119,
    summary:
      "A detailed guide to wok cooking, techniques, and adaptable recipes.",
    description:
      "A hands-on cooking guide covering the tools, heat, ingredients, and methods behind a wide range of wok dishes.",
    pages: 672,
    format: "Hardback",
    published: "2022",
    coverColor: "#e7c586",
    coverAccent: "#763e2a",
    coverLabel: "Cooking",
    tags: ["cooking", "technique", "recipes"],
  },
  {
    id: "tomorrow-and-tomorrow-and-tomorrow",
    title: "Tomorrow, and Tomorrow, and Tomorrow",
    author: "Gabrielle Zevin",
    category: "Fiction",
    price: 749,
    rating: 4.8,
    reviews: 231,
    summary:
      "Two friends build games and navigate a changing creative partnership.",
    description:
      "Across decades of collaboration, two friends create games and revisit the complicated bonds between art, ambition, and love.",
    pages: 416,
    format: "Paperback",
    published: "2022",
    coverColor: "#e5cec1",
    coverAccent: "#6d433c",
    coverLabel: "A novel",
    tags: ["friendship", "games", "creativity"],
    badge: "Trending",
  },
];
