export type BookCategory = "All" | "Fiction" | "Nonfiction" | "Poetry" | "Food & drink";

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

export const categories: BookCategory[] = ["All", "Fiction", "Nonfiction", "Poetry", "Food & drink"];

export const books: Book[] = [
  {
    id: "the-map-of-small-things",
    title: "The Map of Small Things",
    author: "Leila Aboulela",
    category: "Fiction",
    price: 18.5,
    rating: 4.8,
    reviews: 214,
    summary: "A luminous novel about a cartographer learning to find her way home.",
    description: "When a quiet cartographer is sent to redraw the coastline of a city she left behind, she begins to map the overlooked details of a life: the bakery window, a stranger's blue umbrella, the sound of a particular train. Tender and quietly transporting.",
    pages: 336,
    format: "Hardback",
    published: "2024",
    coverColor: "#dfcdb7",
    coverAccent: "#496b56",
    coverLabel: "A novel",
    tags: ["belonging", "place", "quietly moving"],
    featured: true,
    badge: "Staff pick",
  },
  {
    id: "on-looking",
    title: "On Looking",
    author: "Alexandra Horowitz",
    category: "Nonfiction",
    price: 16,
    rating: 4.7,
    reviews: 178,
    summary: "A field guide to seeing the familiar world with fresh eyes.",
    description: "Alexandra Horowitz invites us outside and introduces us to the many ways a single city block can be seen. Part science, part walking companion, this is a generous book about attention and the overlooked magic of ordinary life.",
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
    price: 14.75,
    rating: 4.9,
    reviews: 96,
    summary: "Small, precise poems for the days that need a little more room.",
    description: "Mina Kwon's debut collection makes a home out of the in-between. These poems move with the hush of early mornings, finding tenderness in bus rides, winter light, and the things we almost say.",
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
    price: 28,
    rating: 4.6,
    reviews: 132,
    summary: "Bright Mediterranean cooking for long lunches and late light.",
    description: "A sunlit collection of 90 recipes built around good olive oil, seasonal produce, and the pleasure of feeding people. Every chapter is designed for lingering: from pantry pastas to orange-scented cakes.",
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
    price: 17.25,
    rating: 4.5,
    reviews: 88,
    summary: "A layered family story rooted in one wild, beautiful garden.",
    description: "Three generations, one hidden garden, and the truths that bloom after dark. Hannah Richell writes with an eye for the natural world and a deep sympathy for the ways families carry their histories.",
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
    price: 19.5,
    rating: 4.4,
    reviews: 71,
    summary: "Notes on friendship, work, and becoming yourself in public.",
    description: "Warm, funny, and deeply practical, this is a book about the small negotiations that make up a life: how to make a friend, leave a job, say sorry, and stay close to the people who know you best.",
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
    price: 15.25,
    rating: 4.6,
    reviews: 54,
    summary: "A quietly funny story about change, chance, and city life.",
    description: "In a city where the forecast never seems to settle, two neighbors begin to notice one another. A Little Weather is a delicate, observant novel about coincidence, routine, and the gentle courage of paying attention.",
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
    price: 24,
    rating: 4.8,
    reviews: 110,
    summary: "Simple menus for making an ordinary evening feel considered.",
    description: "From the first drink to the last spoonful, The Good Supper is a thoughtful guide to hosting without the fuss. Buildable menus, generous notes, and recipes that leave you at the table with your guests.",
    pages: 208,
    format: "Hardback",
    published: "2023",
    coverColor: "#e3c2a9",
    coverAccent: "#694d3a",
    coverLabel: "At home",
    tags: ["hosting", "menus", "comfort"],
  },
];
