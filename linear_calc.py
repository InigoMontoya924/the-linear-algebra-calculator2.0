from tkinter import *
from numpy import *
import sympy
import matplotlib
matplotlib.use('TkAgg')
from matplotlib.figure import Figure
import re
from matplotlib import ticker
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from sympy import simplify
import numpy as np


matplotlib.use('TkAgg')
matplotlib.rcParams['text.usetex'] = True
matplotlib.rcParams['text.latex.preamble'] = r'\usepackage{amsmath}\usepackage{indentfirst}'


def slash_to_frac(s):
    """
    Converts all / in a string to TeXable \frac, also converts all * to \times
    """
    s = s[15:]
    s = s[:-13]
    rows = s.split(r'\\')
    output = r'\begin{bmatrix}'
    for row in rows:
        lst = row.split('&')
        for i in lst:
            if re.search(r'^.+/.+/.+', i):  # checks for form 1/2 + 1/3
                elem = i.replace(r'/', r'}{')
                elem = r'\frac{' + elem + r'}&'
                elem = re.sub(r'(?<= )-(?= )', r'}-\\frac{', elem)
                elem = re.sub(r'(?<= )\+(?= )', r'}+\\frac{', elem)
                output += elem + '&'
            elif re.search(r'/(?=.+[+-])[^/]+', i):  # checks for form 1/2 + 3
                elem = i.replace(r'/', r'}{')
                elem = r'\frac{' + elem
                elem = re.sub(r'(?<= )-(?= )', r'}-', elem)
                elem = re.sub(r'(?<= )\+(?= )', r'}+', elem)
                output += elem + '&'
            elif re.search(r'[^/]+[+-].+/', i):  # checks for form 3 + 1/2
                elem = i.replace(r"/", r'}{')
                elem += r'}'
                elem = re.sub(r'(?<= )-(?= )', r'-\\frac{', elem)
                elem = re.sub(r'(?<= )\+(?= )', r'+\\frac{', elem)
                output += elem + r'&'
            elif re.search(r'[^/]+/[^/]+', i):  # checks for form 1/2
                elem = i.replace(r"/", r'}{')
                elem += r'}'
                elem = r'\frac{' + elem
                output += elem + r'&'
            else:
                output += i + '&'
        output = output[:-1]
        output += r'\\'
    output += r'\end{bmatrix}'
    output = output.replace('*', r"\times")
    return output


def mtrx_to_str_matrix(m):
    """
    Converts a matrix in sympy.matrix into a TeXable string
    """
    string = r'\begin{bmatrix}'
    for x in range(0, sympy.shape(m)[0]):
        for y in range(0, sympy.shape(m)[1]):
            string += str(m[x, y]) + r'&'
        string = string[:-1]
        string += r'\\'
    string = string[:-2]
    string += r'\end{bmatrix}'
    string = string.replace(r"sqrt", r'\sqrt')
    string = string.replace(r'(', r'{')
    string = string.replace(r')', r'}')
    string = slash_to_frac(string)
    return string


main = Tk()
main.geometry('2000x2000')
main.title('Linear Algebra Calculator')


def copy_paste(event):
    """
    A code snippet from StackExchange: https://stackoverflow.com/questions/40946919/python-tkinter-copy-paste-not-working-with-other-languages
    """
    ctrl = (event.state & 0x4) != 0
    if event.keycode == 88 and ctrl and event.keysym.lower() != "x":
        event.widget.event_generate("<<Cut>>")

    if event.keycode == 86 and ctrl and event.keysym.lower() != "v":
        event.widget.event_generate("<<Paste>>")

    if event.keycode == 67 and ctrl and event.keysym.lower() != "c":
        event.widget.event_generate("<<Copy>>")


main.bind_all('<Key>', copy_paste, '+')

welcome = Label(main, text="Welcome to the Linear Algebra calculator, created by Kevin")
welcome.place(x=500, y=20)


def enter_status_matrix_name(e):
    status_bar.configure(
        text="Enter the name of the matrix. It will be the variable name of your matrix. Only letters, numbers and space allowed")


def enter_status_matrix_entry(e):
    status_bar.configure(text="Enter the matrix in rows separated with ;, e.g. 1,2;3,4")


def enter_status_entry_called_matrix(e):
    status_bar.configure(text='Enter the name of matrix you want to operate on')


def enter_status_entry_called_matrix_1(e):
    status_bar.configure(text='Enter the name of the second matrix if needed. Does not have effect if not needed')


def leave_status(e):
    status_bar.configure(text='')


status_bar = Label(main, bd=1, relief=SUNKEN, anchor='e')
status_bar.pack(fill=X, side=BOTTOM, ipady=10)

matrix_name = Entry(main)
matrix_name.place(x=400, y=40)
matrix_name.insert(0, 'Matrix Name')
matrix_name.bind("<Enter>", enter_status_matrix_name)
matrix_name.bind("<Leave>", leave_status)

matrix_enter = Entry(main, width=40)
matrix_enter.place(x=650, y=40)
matrix_enter.insert(0, '1,2;3,4')
matrix_enter.bind('<Enter>', enter_status_matrix_entry)
matrix_enter.bind('<Leave>', leave_status)

lst_storage = {}
matrix_storage = {}

error_message = Label(main, text="", fg='red')
error_message.place(x=900, y=130)

texed = {}


def tex_everything():
    """
    Convert all elements in the lst_storage as LaTeX expression as strings, stored in texed
    """
    for keys in lst_storage:
        expression = r'\begin{bmatrix}'
        for row in lst_storage[keys]:
            for i in row:
                expression = expression + str(i) + '&'
            expression = expression[:-1]
            expression += r' \\ '
        expression += r'\end{bmatrix}'
        texed[keys] = expression


def graph(e=None):
    """
    Called when print_lst_storage_button is pressed. Draw LaTeX expression on canvas.
    """
    all_tex = ' '
    for key in texed:
        all_tex = all_tex + r'\[' + r'\text{' + key + '}' + '=' + texed[key] + '\]' + r'\newline' + '\n'
    ax.clear()
    ax.text(0.1, 0.2, all_tex, fontsize=10)
    canvas.draw()


def graph_1(string):
    """
    Called when operate button calls caller. Draw LaTeX expression on canvas_1
    """
    ax_1.clear()
    ax_1.text(0.05, 0.8, string, fontsize=10)
    canvas_1.draw()

def store_matrix(e=None):
    """
    Called when store button is pressed. Store matrix_enter.get() as a list in lst_storage, and as a sympy.Matrix in matrix_storage.
    """
    error_message.configure(text='')
    final = []
    final_2 = []
    try:
        a = str(matrix_enter.get()).replace(' ', '')
        matrx = a.split(';')
        final.extend([i.split(',') for i in matrx])
        for i in final:
            final_2.append([int(j) for j in i])
        length = len(final_2[0])
        for i in final_2:  # Check if each row has same number of elements.
            if len(i) != length:
                error_message.configure(text='Invalid Entry')
        lst_storage[matrix_name.get()] = final_2
        matrix_storage[matrix_name.get()] = sympy.Matrix(final_2)
        tex_everything()
        graph()
    except:
        error_message.configure(text='Invalid Entry')


enter = Button(main, text='Store', command=store_matrix)
enter.place(x=900, y=70)
main.bind('<Return>', store_matrix)

fig = matplotlib.figure.Figure(figsize=(3, 6), dpi=100)

ax = fig.add_subplot(111)
ax.get_xaxis().set_visible(False)
ax.get_yaxis().set_visible(False)

label_store = Label(main)
label_store.place(x=1100, y=100)


canvas = FigureCanvasTkAgg(fig, master=label_store)
canvas.get_tk_widget().pack(side=TOP, expand=1)
canvas._tkcanvas.pack(side=TOP, fill=BOTH, expand=1)

fig_1 = matplotlib.figure.Figure(figsize=(7, 5), dpi=100)

ax_1 = fig_1.add_subplot(111, label='1')

ax_1.get_xaxis().set_visible(False)
ax_1.get_yaxis().set_visible(False)

label_store_1 = Label(main)
label_store_1.place(x=160, y=130)

canvas_1 = FigureCanvasTkAgg(fig_1, master=label_store_1)
canvas_1.get_tk_widget().pack(side=TOP, expand=1)
canvas_1._tkcanvas.pack(side=TOP, fill=BOTH, expand=1)

entry_called_matrix = Entry(main, width=20)
entry_called_matrix.place(x=250, y=110)
entry_called_matrix.insert(0, 'Matrix Name')
entry_called_matrix.bind('<Enter>', enter_status_entry_called_matrix)
entry_called_matrix.bind('<Leave>', leave_status)

entry_called_matrix_1 = Entry(main, width=20)
entry_called_matrix_1.place(x=500, y=110)
entry_called_matrix_1.insert(0, '2nd Matrix Name if needed')
entry_called_matrix_1.bind('<Enter>', enter_status_entry_called_matrix_1)
entry_called_matrix_1.bind('<Leave>', leave_status)

calc_mode = StringVar()

rad_rref = Radiobutton(main, text='RREF', value='rref', variable=calc_mode)
rad_rref.place(x=200, y=650)


# Define every operation below its button, call the operations with the caller function
def rref(name):
    output = matrix_storage[name].rref()[0]
    print(mtrx_to_str_matrix(output))
    return mtrx_to_str_matrix(output)


rad_multiplication = Radiobutton(main, text='Matrix Multiplication', value='mult', variable=calc_mode)
rad_multiplication.place(x=300, y=650)


def multiplication(name_1, name_2):
    output = matrix_storage[name_1] * matrix_storage[name_2]
    return mtrx_to_str_matrix(output)


rad_addition = Radiobutton(main, text='Matrix Addition', value='add', variable=calc_mode)
rad_addition.place(x=500, y=650)


def addition(name_1, name_2):
    output = matrix_storage[name_1] + matrix_storage[name_2]
    return mtrx_to_str_matrix(output)


rad_diagonalization = Radiobutton(main, text='Diagonalization', value='diag', variable=calc_mode)
rad_diagonalization.place(x=700, y=650)


def diagonalization(name):
    P, D = matrix_storage[name].diagonalize()
    P_inv = P ** -1
    output = [mtrx_to_str_matrix(simplify(P, ratio=1.7)), mtrx_to_str_matrix(simplify(D, ratio=1.7)),
              mtrx_to_str_matrix(simplify(P_inv, ratio=1.7))]
    return output


rad_inverse = Radiobutton(main, text='Inverse', value='inv', variable=calc_mode)
rad_inverse.place(x=850, y=650)


def inverse(name):
    output = matrix_storage[name] ** -1
    return mtrx_to_str_matrix(output)


def caller(e=None):
    error_message.configure(text='')
    graph_1('')
    try:
        if str(calc_mode.get()) == 'rref':
            graph_1(r'\[RREF(\text{' + str(entry_called_matrix.get()) + '}) = ' + rref(
                str(entry_called_matrix.get())) + r'\]')
            print(r'\[RREF(\text{' + str(entry_called_matrix.get()) + '}) = ' + rref(
                str(entry_called_matrix.get())) + r'\]')
        elif str(calc_mode.get()) == 'mult':
            graph_1(r'\[\text{' + str(entry_called_matrix.get()) + r'} \times \text{' + str(
                entry_called_matrix_1.get()) + '} = ' + multiplication(str(entry_called_matrix.get()),
                                                                       str(entry_called_matrix_1.get())) + r'\]')
        elif str(calc_mode.get()) == 'add':
            graph_1(r'\[\text{' + str(entry_called_matrix.get()) + r'} + \text{' + str(
                entry_called_matrix_1.get()) + '} = ' + addition(str(entry_called_matrix.get()),
                                                                 str(entry_called_matrix_1.get())) + r'\]')
        elif str(calc_mode.get()) == 'diag':
            graph_1(r'\[P = ' + diagonalization(str(entry_called_matrix.get()))[0] + r'\]' + r'\[D = ' +
                    diagonalization(str(entry_called_matrix.get()))[1] + r'\]' + r'\[P^{-1} = ' +
                    diagonalization(str(entry_called_matrix.get()))[2] + r'\]')
        elif str(calc_mode.get()) == 'inv':
            if matrix_storage[entry_called_matrix.get()].det() == 0:
                error_message.configure(text='Matrix not invertible')
            else:
                graph_1(r'\[\text{' + str(entry_called_matrix.get()) + r'}^{-1} = ' + inverse(
                    str(entry_called_matrix.get())) + r'\]')
        else:
            error_message.configure(text='Please select mode.')
    except KeyError:
        error_message.configure(text='Error: Please check input name')
    except TimeoutError:
        error_message.configure(text='Too complex computation, please try again')


operate = Button(main, text='Operate', command=caller)
operate.place(x=700, y=115)

main.bind('<Command-o>', caller)

shortcuts = Label(main, text='Below are the shortcuts:\n'
                             'Enter: Store\n'
                             'Command + O: Operate')
shortcuts.place(x=20, y=100)


class Visualizer(Toplevel):
    def __init__(self, master=None):
        super().__init__(master=master)
        self.title("Visualizer")
        self.geometry('750x750')

        heading = Label(self,
                        text='Welcome to the Matrix Visualizer. You can visualize any 2x2 matrix here')
        heading_1 = Label(self, text='To do so, enter a matrix name below that you have stored')
        heading.pack(side=TOP, ipady=10)
        heading_1.pack(side=TOP)

        vis_name = Entry(self, text='Enter matrix name here')
        vis_name.pack(side=TOP)

        xlim_entry = Entry(self, width=7)
        xlim_entry.place(x=630, y=100)
        xlim_entry.insert(0, '-6,6')
        xlim_label = Label(self, text='X window e.g. -10,10')
        xlim_label.place(x=480, y=100)

        ylim_entry = Entry(self, width=7)
        ylim_entry.place(x=630, y=130)
        ylim_entry.insert(0, '-6,6')
        ylim_label = Label(self, text='Y window e.g. -10,10')
        ylim_label.place(x=480, y=130)

        def xylim():
            '''
            Returns [xmin, xmax, ymin, ymax]
            '''
            error.configure(text='')
            try:
                xlim = str(xlim_entry.get()).replace(' ', '').split(',')
                ylim = str(ylim_entry.get()).replace(' ', '').split(',')
                lims = [int(i) for i in xlim]
                lims.extend([int(i) for i in ylim])
                if lims[0] > 0 or lims[2] > 0:
                    error.configure(text='x,y min cannot be larger than 0')
                if lims[1] < 0 or lims[3] < 0:
                    error.configure(text='xmax, ymax cannot be smaller than 0')
                return lims
            except:
                error.configure(text='Invalid window')

        f = Figure(figsize=(6, 4), dpi=100)
        self.ax_2 = f.add_subplot(1, 1, 1)
        self.ax_2.grid('on')
        self.ax_2.set_axisbelow(True)

        intervals = float(1)

        loc = ticker.MultipleLocator(base=intervals)
        self.ax_2.xaxis.set_major_locator(loc)
        self.ax_2.yaxis.set_major_locator(loc)

        self.canvas_2 = FigureCanvasTkAgg(f, master=self)
        self.canvas_2.get_tk_widget().pack(side=TOP, expand=0.9)

        error = Label(self, text='', fg='red')
        error.place(x=300, y=110)

        def vector_transform(name):
            """
            Transform unit vectors based on matrix, called by name(dictionary key)
            """
            trs_i = matrix_storage[name] * sympy.Matrix([1, 0])
            trs_j = matrix_storage[name] * sympy.Matrix([0, 1])
            return [trs_i, trs_j]

        def visualize():
            try:
                if sympy.shape(matrix_storage[str(vis_name.get())]) != (2, 2):
                    error.configure(text='Not a 2x2 matrix')
                elif matrix_storage[str(vis_name.get())] == sympy.Matrix([[0,0],[0,0]]):
                    error.configure(text='The zero matrix is not allowed')
            except KeyError:
                error.configure(text='Matrix name not found')
                return None
            vec = np.array([[0, 0, 1, 0], [0, 0, 0, 1], [0, 0, int(vector_transform(str(vis_name.get()))[0][0, 0]), int(vector_transform(str(vis_name.get()))[0][1, 0])], [0, 0, int(vector_transform(str(vis_name.get()))[1][0, 0]), int(vector_transform(str(vis_name.get()))[1][1, 0])]])
            x, y, u, v = zip(*vec)
            self.ax_2.set_xticklabels([]) # disable ticks
            self.ax_2.set_yticklabels([])
            self.ax_2.set_xlim(xylim()[0], xylim()[1])
            self.ax_2.set_ylim(xylim()[2], xylim()[3])
            self.ax_2.axhline(y=0, color=(1, 0.8, 0.8))
            self.ax_2.axvline(x=0, color=(0.8, 0.8, 1))
            trs_i = [int(vector_transform(str(vis_name.get()))[0][0, 0]), int(vector_transform(str(vis_name.get()))[0][1, 0])]
            trs_j = [int(vector_transform(str(vis_name.get()))[1][0, 0]), int(vector_transform(str(vis_name.get()))[1][1, 0])]
            for i in range(1, xylim()[3]+1): # draw positive x grids
                self.ax_2.axline((i * trs_j[0], i * trs_j[1]), (i * trs_j[0] + trs_i[0], i * trs_j[1] + trs_i[1]), linewidth=0.8, color=(0.1, 0, 0.1))
            for i in range(1, xylim()[1]+1): # draw positve y grids
                self.ax_2.axline((i * trs_i[0], i * trs_i[1]), (i * trs_i[0] + trs_j[0], i * trs_i[1] + trs_j[1]), linewidth=0.8, color=(0.1, 0, 0.1))
            for i in range(xylim()[2], 0): # draw negative x grids
                self.ax_2.axline((i * trs_j[0], i * trs_j[1]), (i * trs_j[0] + trs_i[0], i * trs_j[1] + trs_i[1]), linewidth=0.8, color=(0.1, 0, 0.1))
            for i in range(xylim()[0], 0): # draw positive y grids
                self.ax_2.axline((i * trs_i[0], i * trs_i[1]), (i * trs_i[0] + trs_j[0], i * trs_i[1] + trs_j[1]), linewidth=0.8, color=(0.1, 0, 0.1))
            self.ax_2.axline((0, 0), (trs_i[0], trs_i[1]), color=(1, 0.5, 0.5))
            self.ax_2.axline((0, 0), (trs_j[0], trs_j[1]), color=(0.5, 0.5, 1))
            self.ax_2.tick_params(axis='x', which='both', top='False', bottom='False')
            self.ax_2.tick_params(axis='y', which='both', top='False', bottom='False')
            self.ax_2.quiver(x, y, u, v, scale_units='xy', scale=1, angles='xy', width=0.005, color=['r', 'b', 'r', 'b'], label=['i', 'j', 'Ai', 'Aj'])
            self.canvas_2.draw()

        vis_btn = Button(self, text='Visualize', command=visualize, relief='ridge')
        vis_btn.pack(side=TOP, ipady=5)


def call_visual():
    Visualizer(main)


visualizer_btn = Button(main, text='Initiate visualizer', command=call_visual, height=2, width=13, relief='ridge')
visualizer_btn.place(x=900, y=180)


class VectorPlot(Toplevel):
    def __init__(self, master=None):
        super().__init__(master=master)
        self.title('Vector Plot')
        self.geometry('1000x750')
        heading = Label(self, text='Welcome to vector plot')
        heading.pack(side=TOP)
        heading1= Label(self, text='Enter your vector below')
        heading1.pack(side=TOP)


        start_label = Label(self, text='Start point')
        start_label.place(x=100, y=100)
        dimen_label = Label(self, text='Dimension')
        dimen_label.place(x=100, y=150)
        start_point_entry = Entry(self)
        start_point_entry.place(x=200, y=100)
        dimension_entry = Entry(self)
        dimension_entry.place(x=200, y=150)


        del_label = Label(self, text='Delete vector number:')
        del_entry = Entry(self)
        del_label.place(x=600, y=100)
        del_entry.place(x=780, y=100)

        error_store = Label(self, fg='red', text='')
        error_store.place(x=470, y=130)

        error_del = Label(self, fg='red', text='')
        error_del.place(x=800, y=140)

        lab_plot = Label(self)
        lab_plot.place(x=10, y=200)

        f = Figure(figsize=(6, 4), dpi=100)
        self.ax_3 = f.add_subplot(1, 1, 1)
        self.ax_3.grid('on')
        self.ax_3.set_axisbelow(True)

        intervals = float(1)

        loc = ticker.MultipleLocator(base=intervals)
        self.ax_3.xaxis.set_major_locator(loc)
        self.ax_3.yaxis.set_major_locator(loc)

        self.canvas_3 = FigureCanvasTkAgg(f, master=lab_plot)
        self.canvas_3.get_tk_widget().pack(side=TOP, fill=BOTH)

        vector_storage = []

        def graph_4(string):
            """
            Called when operate button calls caller. Draw LaTeX expression on canvas_1
            """
            ax_4.clear()
            ax_4.text(0.05, 0.05, string, fontsize=10)
            canvas_4.draw()

        def store(e=None):
            lst = []
            try:
                error_store.configure(text='')
                if re.search(r'([0-9]+),( *)([0-9]+)( *)', str(start_point_entry.get())) and re.search(r'([0-9]+),( *)([0-9]+)', str(dimension_entry.get())):
                    print(True)
                    string = str(start_point_entry.get()).replace(' ', '')
                    lst.extend(string.split(','))
                    string = str(dimension_entry.get()).replace(' ', '')
                    lst.extend(string.split(','))
                    vector_storage.append(lst)
                    string = ''
                    counter = 1
                    for i in vector_storage:
                        string += r'\[v_' + str(counter) +  r' = \begin{bmatrix}' + i[2] + r'\\' + i[3] + r'\end{bmatrix}\text{ Initial position:} '+ i[0] + ',' + i[1] + '\]' + '\n\n'
                        counter += 1
                    graph_4(string)
                    start_point_entry.delete(0, 'end')
                    dimension_entry.delete(0, 'end')
                else:
                    print(False)
                    error_store.configure(text="Entry should be in the form: 1,2")
            except:
                vector_storage.pop(-1)
                error_store.configure(text="Entry should be in the form: 1,2")

        store_btn = Button(self, text="Store", command=store)
        store_btn.place(x=400, y=130)

        self.bind('<Return>', store)

        def delete_vector(e=None):
            try:
                if int(str(del_entry.get())) > len(vector_storage):
                    error_del.configure(text='Invalid index')
                    return None
            except:
                error_del.configure(text='Index is an integer')
                return None

            vector_storage.pop(int(str(del_entry.get())) - 1)
            string = ''
            counter = 1
            for i in vector_storage:
                string += r'\[v_' + str(counter) +  r' = \begin{bmatrix}' + i[2] + r'\\' + i[3] + r'\end{bmatrix}\text{ Initial position:} '+ i[0] + ',' + i[1] + '\]' + '\n\n'
                counter += 1
            graph_4(string)

        del_button = Button(self, text='Delete', command=delete_vector)
        del_button.place(x=900, y=140)

        def window():
            lst1 = ([(float(i[0]) + float(i[2])) for i in vector_storage])
            lst2 = ([(float(i[0]) + float(i[2])) for i in vector_storage])
            lst3 = ([(float(i[1]) + float(i[3])) for i in vector_storage])
            lst4 = ([(float(i[1]) + float(i[3])) for i in vector_storage])
            xmin = min(lst1)
            xmax = max(lst2)
            ymin = min(lst3)
            ymax = max(lst4)
            if xmin > 0:
                xmin = 0
            if ymin > 0:
                ymin = 0
            if xmax < 0:
                xmax = 0
            if ymax < 0:
                xmax = 0
            return [xmin - 2, xmax + 2, ymin - 2, ymax +2]

        def plot(e=None):
            vec = np.array(vector_storage)
            X, Y, U, V = zip(*vec)
            x = [float(i) for i in X]
            y = [float(i) for i in Y]
            u = [float(i) for i in U]
            v = [float(i) for i in V]
            self.ax_3.quiver(x, y, u, v, scale_units='xy', scale=1, angles='xy', width=0.005)
            self.ax_3.set_xlim(window()[0], window()[1])
            self.ax_3.set_ylim(window()[2], window()[3])
            self.ax_3.axhline(y=0, color='black')
            self.ax_3.axvline(x=0, color='black')

            self.canvas_3.draw()

        fig_4 = matplotlib.figure.Figure(figsize=(7, 5), dpi=100)

        ax_4 = fig_4.add_subplot(121, label='4')
        ax_4.get_xaxis().set_visible(False)
        ax_4.get_yaxis().set_visible(False)

        lab_store = Label(self)
        lab_store.place(x=600, y=180)

        canvas_4 = FigureCanvasTkAgg(fig_4, master=lab_store)
        canvas_4.get_tk_widget().pack(side=TOP, expand=1)
        canvas_4._tkcanvas.pack(side=TOP, expand=1)

        plot = Button(self, text='Plot', command=plot, relief='ridge')
        plot.place(x=300, y=600)


def call_plot():
    VectorPlot(main)


plot_btn = Button(main, text='Initiate vector plot', command=call_plot, height=2, width=20, relief='ridge')
plot_btn.place(x=900, y=220)


main.mainloop()
