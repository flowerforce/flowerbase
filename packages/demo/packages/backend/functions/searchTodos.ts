
const searchTodos = async ({ page, pageSize = 10 }: { page?: number; pageSize?: number }) => {
  const todosCollection = context.services
    .get("mongodb-atlas")
    .db("flowerbase-demo")
    .collection("todos");

  if (page) {
    const totalCount = (await todosCollection.find({}).toArray()).length;
    const results = await todosCollection
      .find({})
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      currentPage: page,
      total: totalCount,
      todos: results,
    };
  }

  return await todosCollection.find({}).toArray();
}


export = searchTodos;