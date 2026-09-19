import { useEffect, useState } from "react";
import {BrowserRouter,
  Routes, Route, Link, Navigate, useParams, useNavigate,} from "react-router-dom";

import "./App.css";
import { apiRequest } from "./apiClient";

function Login() {
  return (
    <div className="page">
      <div className="card">
        <h2>Login</h2>
        <p>Sign in to access the Healthcare Financial Strategy Dashboard.</p>

        <button className="primary-button"
        onClick={() => {
          window.location.href = "http://localhost:3000/login";
          }}
          
        >
          Login with Cognito
        </button>

      </div>
    </div>
  );
}




function Initiatives() {
  const [initiatives, setInitiatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInitiatives() {
      try {
        const data = await apiRequest("/api/insights");

        setInitiatives(data.data || []);
      } catch (error) {
        setError(
          error.message ||
          "Could not load initiatives."
        );
      } finally {
        setLoading(false);
      }
    }

    loadInitiatives();
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading initiatives...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <h2>Unable to load initiatives</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Financial Strategy Initiatives</h2>
          <p>
            View and manage healthcare financial improvement initiatives.
          </p>
        </div>

        <Link
          className="primary-button link-button"
          to="/initiatives/new"
        >
          New Initiative
        </Link>
      </div>

      <div className="card">
        <h3>Initiatives</h3>

        {initiatives.length === 0 ? (
          <p>No initiatives have been created yet.</p>
        ) : (
          initiatives.map((initiative) => (
            <div
              key={initiative.insightId}
              className="initiative-item"
            >
              <div>
                <h3>{initiative.title}</h3>

                <p>
                  <strong>Category:</strong>{" "}
                  {initiative.category}
                </p>

                <p>
                  <strong>Status:</strong>{" "}
                  {initiative.status}
                </p>
              </div>

              <Link
                to={`/initiatives/${initiative.insightId}`}
              >
                View Details
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


function InitiativeDetail() {
  const { id } = useParams();

  const [initiative, setInitiative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInitiative() {
      try {
        const data = await apiRequest(`/api/insights/${id}`);
        setInitiative(data.data);
      } catch (error) {
        if (error.message === "Forbidden") {
          setError("You are not authorized to view this initiative.");
        } else {
          setError(
            error.message ||
            "This initiative does not exist or has been deleted."
          );
        }
      } finally {
        setLoading(false);
      }
    }

    loadInitiative();
  }, [id]);

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading initiative...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <h2>Unable to Load Initiative</h2>
          <p>{error}</p>

          <Link to="/initiatives">
            Back to Initiatives
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <h2>{initiative.title}</h2>

        <p>
          <strong>Description:</strong>{" "}
          {initiative.description}
        </p>

        <p>
          <strong>Category:</strong>{" "}
          {initiative.category}
        </p>

        <p>
          <strong>Status:</strong>{" "}
          {initiative.status}
        </p>

        <p>
          <strong>Created:</strong>{" "}
          {new Date(initiative.createdAt).toLocaleString()}
        </p>

        <p>
          <strong>Last Updated:</strong>{" "}
          {new Date(initiative.updatedAt).toLocaleString()}
        </p>

        <div className="form-actions">
          <Link
          className="primary-button link-button"
          to={`/initiatives/${initiative.insightId}/edit`}
          >
            Edit Initiative
          </Link>
            
          <Link to="/initiatives">
          Back to Initiatives
          </Link>
        </div>

        <Link to="/initiatives">
          Back to Initiatives
        </Link>
      </div>
    </div>
  );
}


function EditInitiative() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("Open");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadInitiative() {
      try {
        const data = await apiRequest(`/api/insights/${id}`);

        setTitle(data.data.title || "");
        setDescription(data.data.description || "");
        setCategory(data.data.category || "");
        setStatus(data.data.status || "Open");
      } catch (error) {
        setError(
          error.message ||
          "Could not load this initiative."
        );
      } finally {
        setLoading(false);
      }
    }

    loadInitiative();
  }, [id]);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    if (!category.trim()) {
      setError("Category is required.");
      return;
    }

    try {
      setSaving(true);

      await apiRequest(`/api/insights/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          description,
          category,
          status,
        }),
      });

      setSuccess("Initiative updated successfully.");

      setTimeout(() => {
        navigate(`/initiatives/${id}`);
      }, 800);
    } catch (error) {
      setError(
        error.message ||
        "Could not update the initiative."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading initiative...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Edit Initiative</h2>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-title">
              Title
            </label>

            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-description">
              Description
            </label>

            <textarea
              id="edit-description"
              rows="5"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-category">
              Category
            </label>

            <input
              id="edit-category"
              type="text"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-status">
              Status
            </label>

            <select
              id="edit-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value)
              }
            >
              <option value="Open">
                Open
              </option>
              <option value="In Progress">
                In Progress
              </option>
              <option value="Completed">
                Completed
              </option>
            </select>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>

            <Link
              to={`/initiatives/${id}`}
              className="secondary-link"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}


function NewInitiative() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("Open");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    if (!category.trim()) {
      setError("Category is required.");
      return;
    }

    try {
      setSaving(true);

      await apiRequest("/api/insights", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          category,
          status,
        }),
      });

      setSuccess("Initiative created successfully.");

      setTitle("");
      setDescription("");
      setCategory("");
      setStatus("Open");

      setTimeout(() => {
        window.location.href = "/initiatives";
      }, 1000);
    } catch (error) {
      setError(
        error.message ||
        "Could not save the initiative. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Create Initiative</h2>

        <p>
          Add a new healthcare financial strategy initiative.
        </p>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">
              Title
            </label>

            <input
              id="title"
              type="text"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="Example: Monthly Financial Review"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">
              Description
            </label>

            <textarea
              id="description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Describe the financial initiative"
              rows="5"
            />
          </div>

          <div className="form-group">
            <label htmlFor="category">
              Category
            </label>

            <input
              id="category"
              type="text"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)
              }
              placeholder="Example: Cost Management"
            />
          </div>

          <div className="form-group">
            <label htmlFor="status">
              Status
            </label>

            <select
              id="status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value)
              }
            >
              <option value="Open">
                Open
              </option>

              <option value="In Progress">
                In Progress
              </option>

              <option value="Completed">
                Completed
              </option>
            </select>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Create Initiative"}
            </button>

            <Link
              to="/initiatives"
              className="secondary-link"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}



function AppLayout() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("http://localhost:3000/api/me", {
          credentials: "include",
        });

        if (!response.ok) {
          setUser(null);
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error("Could not load user:", error);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }

    loadUser();
  }, []);

  return (
    <div className="app">
      <header className="navbar">
        <div>
          <h1>Healthcare Financial Strategy Dashboard</h1>
        </div>

        <nav>
          <Link to="/initiatives">Initiatives</Link>

          {authLoading ? (
            <span>Checking login...</span>
          ) : user ? (
            <span>Logged in as {user.email}</span>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/initiatives" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/initiatives" element={<Initiatives />} />
          <Route path="/initiatives/new" element={<NewInitiative />} />
          <Route path="/initiatives/:id" element={<InitiativeDetail />} />
          <Route path="/initiatives/:id/edit" element={<EditInitiative />} />
        </Routes>
      </main>
    </div>
  );
}


function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;