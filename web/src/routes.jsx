import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { RoleGuard } from './components/layout/RoleGuard.jsx';
import { Login } from './pages/auth/Login.jsx';
import { Register } from './pages/auth/Register.jsx';
import { Landing } from './pages/Landing.jsx';
import { NotFound } from './pages/NotFound.jsx';
import { TeacherDashboard } from './pages/teacher/TeacherDashboard.jsx';
import { QuizzesPage } from './pages/teacher/QuizzesPage.jsx';
import { QuizWizard } from './pages/teacher/QuizWizard.jsx';
import { QuizDetail } from './pages/teacher/QuizDetail.jsx';
import { StudentDashboard } from './pages/student/StudentDashboard.jsx';
import { QuizPlayer } from './pages/student/QuizPlayer.jsx';
import { QuizResult } from './pages/student/QuizResult.jsx';
import { HistoryPage } from './pages/student/HistoryPage.jsx';
import { AdminDashboard } from './pages/admin/AdminDashboard.jsx';

const teacher = (el) => <RoleGuard roles={['teacher']}>{el}</RoleGuard>;
const student = (el) => <RoleGuard roles={['student']}>{el}</RoleGuard>;
const admin = (el) => <RoleGuard roles={['admin']}>{el}</RoleGuard>;

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<AppShell />}>
          {/* Teacher */}
          <Route path="/teacher" element={teacher(<TeacherDashboard />)} />
          <Route path="/teacher/quizzes" element={teacher(<QuizzesPage />)} />
          <Route path="/teacher/quizzes/new" element={teacher(<QuizWizard />)} />
          <Route path="/teacher/quizzes/:id" element={teacher(<QuizDetail />)} />

          {/* Student */}
          <Route path="/student" element={student(<StudentDashboard />)} />
          <Route path="/student/history" element={student(<HistoryPage />)} />
          <Route path="/student/quiz/:quizId" element={student(<QuizPlayer />)} />
          <Route path="/student/quiz/:quizId/result" element={student(<QuizResult />)} />

          {/* Admin */}
          <Route path="/admin" element={admin(<AdminDashboard />)} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
