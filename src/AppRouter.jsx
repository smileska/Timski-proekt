import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthGoogle from './pages/OAuthGoogle';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Workouts from './pages/Workouts';
import Restaurants from './pages/Restaurants';
import MealHistory from './pages/MealHistory';
import BloodworkDetail from './pages/BloodworkDetail';

function Protected({ children }) {
    const { user, hasProfile, loading } = useAuth();
    if (loading) {
        return (
            <div className="center" style={{ padding: 60 }}>
                <div className="spin" />
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (!hasProfile) return <Navigate to="/onboarding" replace />;
    return children;
}

export default function AppRouter() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <LocationProvider>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/oauth/google" element={<OAuthGoogle />} />
                        <Route path="/onboarding" element={<Onboarding />} />

                        <Route
                            element={
                                <Protected>
                                    <Layout />
                                </Protected>
                            }
                        >
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/restaurants" element={<Restaurants />} />
                            <Route path="/workouts" element={<Workouts />} />
                            <Route path="/meals/history" element={<MealHistory />} />
                            <Route path="/profile" element={<Profile />} />
                            <Route path="/bloodwork/:id" element={<BloodworkDetail />} />
                        </Route>

                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                </LocationProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
