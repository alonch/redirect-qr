import './App.css';
import React from 'react';

function App() {
  //write a sample app that has 2 fields, with 2 state
  //variables, and a button that when clicked, displays
  //the sum of the 2 fields
  const [x, setX] = React.useState(2);
  const [y, setY] = React.useState(5);
  const [total, setTotal] = React.useState(0);
   
  const sum = () => {
    fetch(`${process.env.REACT_APP_API_URL}plus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ x, y })
    })
      .then(res => res.json())
      .then(data => {
        setTotal(data.total);
      })
  }
  // return a div with 2 fields, on submit call a backend api plus endpoint
  return (
    <div class="container py-5">
    <div class="card shadow-lg">
      <div class="card-body">
        <h3 class="card-title text-center mb-4">Sum Calculator</h3>
        <form>
          <div class="mb-3">
            <label for="inputX" class="form-label">Value X</label>
            <input
              type="number"
              id="inputX"
              class="form-control"
              value={x}
              onChange={(e) => setX(e.target.value)}
              placeholder="Enter the first number"
            />
          </div>
          <div class="mb-3">
            <label for="inputY" class="form-label">Value Y</label>
            <input
              type="number"
              id="inputY"
              class="form-control"
              value={y}
              onChange={(e) => setY(e.target.value)}
              placeholder="Enter the second number"
            />
          </div>
          <p class="fw-bold text-center mt-3">Result: <span>{total}</span></p>
          <div class="d-grid">
            <button type="button" class="btn btn-primary" onClick={sum}>
              Calculate Sum
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
  );

}

export default App;
