
const searchTodos = async ({ page, pageSize = 10 }: { page?: number; pageSize?: number }) => {
  const todosCollection = context.services
    .get("mongodb-atlas")
    .db("flowerbase-demo")
    .collection("todos");

  if (page) {
    const items = (await todosCollection.find({}).toArray());

    const start = pageSize * (page - 1)
    const end = start + pageSize

    const results = items.slice(start, end)

    return {
      currentPage: page,
      total: items.length,
      todos: results,
    };
  }

  return await todosCollection.find({}).toArray();
}


export = searchTodos;