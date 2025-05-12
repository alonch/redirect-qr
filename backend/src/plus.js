exports.handler = async function (parameters) {
  const {
    body: { x, y }
  } = parameters
  return {
    status: 200,
    body: {
      total: x+y
    }
  };
};